/* eslint-disable no-console */
/**
 * One-time setup script for MTN MoMo sandbox credentials.
 *
 * Usage:
 *   1. Register at https://momodeveloper.mtn.com/ and subscribe to the
 *      "Collections" product to get a subscription key.
 *   2. Set MTN_MOMO_SUBSCRIPTION_KEY in backend/.env
 *   3. Run: node scripts/provision-momo.js
 *   4. Copy the printed apiUser/apiKey into MTN_MOMO_API_USER / MTN_MOMO_API_KEY in .env
 *
 * This only needs to be run once per subscription key.
 */
require('dotenv').config();
const { provisionSandboxUser } = require('../src/services/momoService');

async function main() {
  if (!process.env.MTN_MOMO_SUBSCRIPTION_KEY) {
    console.error('Set MTN_MOMO_SUBSCRIPTION_KEY in your .env first (from the MTN MoMo developer portal).');
    process.exit(1);
  }
  try {
    const { apiUser, apiKey } = await provisionSandboxUser();
    console.log('MTN MoMo sandbox user provisioned successfully.\n');
    console.log(`MTN_MOMO_API_USER=${apiUser}`);
    console.log(`MTN_MOMO_API_KEY=${apiKey}`);
    console.log('\nAdd both lines to backend/.env, then restart the server.');
  } catch (err) {
    console.error('Provisioning failed:', err.response?.data || err.message);
    process.exit(1);
  }
}

main();
