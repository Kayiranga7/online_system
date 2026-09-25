const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');

/**
 * MTN Mobile Money - Collections API (sandbox or production via MTN_MOMO_ENVIRONMENT).
 * Docs: https://momodeveloper.mtn.com/
 *
 * MTN's sandbox is genuinely public: you self-register an API user + API key
 * against a subscription key obtained from the MTN MoMo developer portal,
 * then call Collections endpoints against the sandbox host. This service
 * implements the standard Collections "Request to Pay" flow:
 *   1. provisionSandboxUser (one-time setup, see scripts/provision-momo.js)
 *   2. getToken (per-request OAuth2 client-credentials token)
 *   3. requestToPay (initiates the customer-facing payment prompt)
 *   4. getTransactionStatus (poll until SUCCESSFUL/FAILED)
 */

const BASE_URL = process.env.MTN_MOMO_ENVIRONMENT === 'production'
  ? 'https://proxy.momoapi.mtn.com'
  : 'https://sandbox.momodeveloper.mtn.com';

const SUBSCRIPTION_KEY = process.env.MTN_MOMO_SUBSCRIPTION_KEY;
const API_USER = process.env.MTN_MOMO_API_USER;
const API_KEY = process.env.MTN_MOMO_API_KEY;
const TARGET_ENV = process.env.MTN_MOMO_ENVIRONMENT === 'production' ? 'mtnrwanda' : 'sandbox';

let cachedToken = null;
let tokenExpiresAt = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 30_000) return cachedToken;

  const credentials = Buffer.from(`${API_USER}:${API_KEY}`).toString('base64');
  const res = await axios.post(
    `${BASE_URL}/collection/token/`,
    {},
    { headers: { Authorization: `Basic ${credentials}`, 'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY } }
  );
  cachedToken = res.data.access_token;
  tokenExpiresAt = Date.now() + Number(res.data.expires_in) * 1000;
  return cachedToken;
}

/**
 * Normalizes a Rwandan phone number to MTN's expected MSISDN format.
 * Accepts: +250788123456, 250788123456, 0788123456
 * Returns: 250788123456 (no +, no leading 0)
 */
function normalizePhone(phone) {
  let raw = phone.replace(/[\s\-()]/g, ''); // strip formatting
  if (raw.startsWith('+')) raw = raw.slice(1);   // +250788... -> 250788...
  if (raw.startsWith('0')) raw = '250' + raw.slice(1); // 0788... -> 250788...
  return raw;
}

/**
 * Initiates a Request-to-Pay: the customer receives a USSD prompt on their
 * phone to approve the charge. Returns the referenceId used to poll status.
 *
 * Verifies the MTN API response before returning — if MTN rejects the
 * request (wrong currency, invalid number, etc.) this throws instead of
 * returning a referenceId for a payment that never started.
 */
async function requestToPay({ amount, currency, phoneNumber, orderNumber, payerMessage }) {
  const referenceId = uuidv4();
  const token = await getToken();
  const msisdn = normalizePhone(phoneNumber);

  // Sandbox only accepts EUR; production deployments in Rwanda use RWF.
  const effectiveCurrency = process.env.MTN_MOMO_ENVIRONMENT === 'production' ? (currency || 'RWF') : 'EUR';

  let res;
  try {
    res = await axios.post(
      `${BASE_URL}/collection/v1_0/requesttopay`,
      {
        amount: String(amount),
        currency: effectiveCurrency,
        externalId: orderNumber,
        payer: { partyIdType: 'MSISDN', partyId: msisdn },
        payerMessage: payerMessage || `Payment for order ${orderNumber}`,
        payeeNote: `IMIZI order ${orderNumber}`,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Reference-Id': referenceId,
          'X-Target-Environment': TARGET_ENV,
          'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (err) {
    // MTN API error — the USSD prompt was NOT sent. Throw with a clear
    // message so the controller returns a 502 to the frontend.
    const mtErr = err.response?.data || {};
    logger.error('MTN requestToPay API error', {
      status: err.response?.status,
      reason: mtErr.reason || mtErr.message || err.message,
      msisdn,
      amount,
      currency: effectiveCurrency,
    });
    throw new Error(
      mtErr.reason
        ? `MTN rejected the payment: ${mtErr.reason}`
        : `MTN API request failed: ${err.message}`
    );
  }

  // Some MTN environments return 200 with an error body. Verify the
  // response actually indicates the prompt was queued.
  if (res.data && res.data.status && res.data.status !== 'PENDING') {
    logger.error('MTN requestToPay returned non-PENDING status', {
      status: res.data.status,
      response: res.data,
      msisdn,
    });
    throw new Error(`MTN returned unexpected status: ${res.data.status}`);
  }

  logger.info('MTN requestToPay succeeded', { referenceId, msisdn, amount, currency: effectiveCurrency });
  return { referenceId };
}

/** Polls the status of a previously-initiated requestToPay call. */
async function getTransactionStatus(referenceId) {
  const token = await getToken();
  const res = await axios.get(`${BASE_URL}/collection/v1_0/requesttopay/${referenceId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Target-Environment': TARGET_ENV,
      'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
    },
  });
  return res.data; // { status: 'PENDING' | 'SUCCESSFUL' | 'FAILED', ... }
}

/**
 * One-time provisioning helper (sandbox only): creates an API user + API key
 * under the developer's subscription key. Run via scripts/provision-momo.js,
 * not on every request - the resulting MTN_MOMO_API_USER/MTN_MOMO_API_KEY get
 * saved to .env once and reused thereafter.
 */
async function provisionSandboxUser() {
  const referenceId = uuidv4();
  await axios.post(
    `${BASE_URL}/v1_0/apiuser`,
    { providerCallbackHost: process.env.API_BASE_URL || 'http://localhost:5000' },
    { headers: { 'X-Reference-Id': referenceId, 'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY, 'Content-Type': 'application/json' } }
  );
  const keyRes = await axios.post(`${BASE_URL}/v1_0/apiuser/${referenceId}/apikey`, {}, {
    headers: { 'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY },
  });
  return { apiUser: referenceId, apiKey: keyRes.data.apiKey };
}

module.exports = { requestToPay, getTransactionStatus, provisionSandboxUser, normalizePhone };
