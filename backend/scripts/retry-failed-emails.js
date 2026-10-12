/* eslint-disable no-console */
/**
 * Re-sends emails that are stuck in the email_queue as 'failed' (or 'queued').
 *
 * Usage:
 *   node scripts/retry-failed-emails.js                 # dry run - shows the plan, sends nothing
 *   node scripts/retry-failed-emails.js --apply         # actually re-sends
 *   node scripts/retry-failed-emails.js --apply --limit=50
 *   node scripts/retry-failed-emails.js --apply --id=8 --id=9
 *
 * Verification and password-reset emails carry a single-use link, so rows whose
 * link has expired or already been used are skipped - both cases are equally
 * dead to the recipient and re-sending them would only add noise. Rows without
 * a link (order confirmations, KYC and task notices) are always retried.
 *
 * The run is refused outright unless a real email transport is configured:
 * otherwise delivery is a no-op and the rows would be marked 'sent' while
 * nothing left the machine.
 */
require('dotenv').config();

// Declared before parseArgs runs; the service clamps whatever it receives to its
// own range anyway, so this is only the CLI default.
const DEFAULT_BATCH = 20;

const args = parseArgs(process.argv.slice(2));

// Handled before the requires below so --help never opens a database connection.
if (args.help) {
  if (args.error) console.error(args.error);
  printHelp();
  process.exit(args.error ? 1 : 0);
}

// --json has to be machine-readable, but these modules write to stdout when they
// load (a DB connection banner) and while they run (the logger), so both are
// muted in that mode.
const muted = args.json;
const origLog = console.log;
if (muted) console.log = () => {};

const { pool } = require('../src/config/database');
const logger = require('../src/config/logger');
if (muted) logger.silent = true;
const { retryQueuedEmails } = require('../src/services/emailRetryService');

if (muted) console.log = origLog;

function parseArgs(argv) {
  const ids = [];
  let apply = false;
  let limit = null; // null = flag not given, so "abc" is rejected rather than quietly defaulted
  let json = false;

  for (const arg of argv) {
    if (arg === '--apply') apply = true;
    else if (arg === '--json') json = true;
    else if (arg.startsWith('--limit=')) limit = Number(arg.slice('--limit='.length));
    else if (arg.startsWith('--id=')) ids.push(Number(arg.slice('--id='.length)));
    else if (arg === '--help' || arg === '-h') return { help: true };
    else return { help: true, error: `Unknown argument: ${arg}` };
  }

  if (limit !== null && !(Number.isInteger(limit) && limit >= 1)) {
    return { help: true, error: '--limit must be a positive integer.' };
  }
  if (ids.some((id) => !Number.isInteger(id) || id < 1)) {
    return { help: true, error: '--id must be a positive integer (repeat the flag for several).' };
  }
  return { apply, limit: limit === null ? DEFAULT_BATCH : limit, json, ids: ids.length ? ids : null };
}

function printHelp() {
  console.log(`Re-send failed emails from the queue.

  node scripts/retry-failed-emails.js [--apply] [--limit=N] [--id=N]... [--json]

  --apply      actually send (without it this is a dry run that sends nothing)
  --limit=N    how many candidates to look at, 1-50 (default ${DEFAULT_BATCH})
  --id=N       only consider this queue id (repeatable)
  --json       print the raw report instead of a summary`);
}

(async () => {
  try {
    const report = await retryQueuedEmails({ ids: args.ids, limit: args.limit, dryRun: !args.apply });

    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`${report.dryRun ? 'DRY RUN (nothing sent)' : 'RETRY RUN'} - ${report.candidates} candidate(s), ${report.eligible} with a usable link\n`);
      if (report.dryRun && report.eligible) {
        console.log('Would re-send:');
        console.log(`  ${report.eligible} email(s). Re-run with --apply to send them.`);
      }
      if (report.dryRun && !report.providerReady) {
        console.log('\nNo email provider is configured yet, so --apply would refuse. Set RESEND_API_KEY (or the SMTP_* credentials) first.');
      }
      if (report.sent) console.log(`Re-sent: ${report.sent}`);
      if (report.failed) console.log(`Still failing: ${report.failed}`);
      for (const err of report.errors) console.log(`  #${err.id} ${err.error}`);
      if (report.skipped.length) {
        console.log(`\nSkipped (${report.skipped.length}):`);
        for (const row of report.skipped) {
          console.log(`  #${row.id} ${row.template} -> ${row.to_email}: ${row.reason}`);
        }
      }
      if (!report.candidates) console.log('Nothing in the queue is waiting on a retry.');
    }

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error(`Retry failed: ${err.message}`);
    await pool.end().catch(() => {});
    process.exit(1);
  }
})();
