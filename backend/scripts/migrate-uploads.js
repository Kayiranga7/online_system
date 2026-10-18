/**
 * One-off: copy the uploads folder into the deployment's storage and repoint
 * the database rows at the URLs that storage serves.
 *
 * Dry run by default - it reads the database, resolves the URL each file will
 * have, and prints what applying would change:
 *
 *   node scripts/migrate-uploads.js
 *   node scripts/migrate-uploads.js --apply
 *
 * Where files go is decided by the same configuration the app uses: S3_BUCKET
 * (any S3-compatible provider) if set, otherwise the local disk directory
 * resolved from UPLOAD_DIR / RAILWAY_VOLUME_MOUNT_PATH. Run it on the machine
 * that holds the files and with the target storage's credentials - for a
 * Railway volume that means running it on the service (`railway run`), with
 * UPLOAD_DIR pointing at the mount path.
 */
require('dotenv').config();

const args = parseArgs(process.argv.slice(2));

// --json has to be machine-readable, but the modules below write to stdout when
// they load (a DB banner, storage banner) and while they run (the logger).
const muted = args.json && !args.help;
const origLog = console.log;
if (muted) console.log = () => {};

const { pool } = require('../src/config/database');
const logger = require('../src/config/logger');
if (muted) logger.silent = true;
const { planUploadMigration, applyUploadMigration } = require('../src/services/uploadMigrationService');

if (muted) console.log = origLog;

const DEFAULT_SOURCE = './uploads';

function parseArgs(argv) {
  let apply = false;
  let json = false;
  let verify = false;
  let source = null;
  let limit = null; // null = flag not given, so "abc" is rejected rather than quietly defaulted
  const categories = [];

  for (const arg of argv) {
    if (arg === '--apply') apply = true;
    else if (arg === '--json') json = true;
    else if (arg === '--verify') verify = true;
    else if (arg.startsWith('--source=')) source = arg.slice('--source='.length);
    else if (arg.startsWith('--only=')) categories.push(arg.slice('--only='.length));
    else if (arg.startsWith('--limit=')) limit = Number(arg.slice('--limit='.length));
    else if (arg === '--help' || arg === '-h') return { help: true };
    else return { help: true, error: `Unknown argument: ${arg}` };
  }

  if (limit !== null && !(Number.isInteger(limit) && limit >= 1)) {
    return { help: true, error: '--limit must be a positive integer.' };
  }
  if (categories.some((c) => !c || c.includes('/') || c.includes('..'))) {
    return { help: true, error: '--only must be a category name such as plants or designs.' };
  }
  return { apply, json, verify, source, limit, categories };
}

function printHelp() {
  console.log(`Copy the uploads folder into the deployment's storage and repoint
the database rows at the URLs it serves.

  node scripts/migrate-uploads.js [--apply] [--source=DIR] [--only=CATEGORY]... [--limit=N] [--verify] [--json]

  --apply            copy the files and rewrite the rows (without it: dry run)
  --source=DIR       folder to copy from (default ${DEFAULT_SOURCE})
  --only=CATEGORY    only this category, e.g. plants (repeatable)
  --limit=N          stop after N files
  --verify           after copying, read each file back through the storage
                     layer and compare its size
  --json             print the raw report instead of a summary

Destination is whatever the app is configured to use: S3-compatible storage
when S3_BUCKET is set, otherwise the local directory from UPLOAD_DIR (or the
RAILWAY_VOLUME_MOUNT_PATH of an attached volume). Files are copied, never
deleted - the source folder is left untouched.`);
}

function describeTarget(target) {
  return target.kind === 's3'
    ? `S3 bucket ${target.bucket} (${target.urlBase})`
    : `local disk ${target.directory}`;
}

function printPlan(plan) {
  console.log(`DRY RUN (nothing copied, nothing rewritten)\n`);
  console.log(`Destination: ${describeTarget(plan.target)}`);
  console.log(`Source:      ${plan.sourceDir}`);
  console.log(`Files:       ${plan.summary.filesSelected} (${(plan.summary.bytes / 1024 / 1024).toFixed(1)} MB)`);

  if (plan.sameDirectory) {
    console.log('\nNothing to copy: these files are already in the directory the app serves.');
    console.log('If you meant to copy them onto a deployed volume, run this script on that');
    console.log('service (or set UPLOAD_DIR to the mount path) first.');
  } else {
    console.log(`Copies:      ${plan.summary.filesSelected} file(s) -> ${plan.target.kind === 's3' ? 'bucket' : plan.target.directory}`);
  }

  const s = plan.summary;
  console.log(`Database:    ${s.references} row(s) reference these files:`);
  console.log(`             ${s.rowsToUpdate} would be rewritten`);
  if (s.rowsAlreadyAtTarget) console.log(`             ${s.rowsAlreadyAtTarget} already point at the destination`);
  if (s.rowsLeftAsIs) console.log(`             ${s.rowsLeftAsIs} left as-is (rows that store a storage key, e.g. KYC documents)`);

  const shown = plan.files.slice(0, 25);
  if (shown.length) {
    console.log('');
    for (const file of shown) {
      const rows = file.references.length
        ? `  (${file.references.length} row(s)${file.rowsToUpdate ? `, ${file.rowsToUpdate} to rewrite` : ''})`
        : '';
      console.log(`  ${file.key}  ${(file.size / 1024).toFixed(0)} KB  ->  ${file.plannedUrl}${rows}`);
    }
    if (plan.files.length > shown.length) console.log(`  ... and ${plan.files.length - shown.length} more`);
  }

  if (plan.summary.filesWithoutReferences) {
    console.log(`\n${plan.summary.filesWithoutReferences} file(s) are not referenced by any row (they will still be copied).`);
  }
  const skippedTotal = plan.summary.filesSkippedByFilter + plan.summary.filesSkippedByLimit;
  if (skippedTotal) console.log(`\nSkipped by --only/--limit: ${skippedTotal} file(s).`);
  if (plan.sameDirectory && !plan.summary.rowsToUpdate) {
    console.log('\nNothing to do here: every file and row is already where this deployment serves it from.');
  } else if (plan.summary.filesSelected) {
    console.log('\nRe-run with --apply to copy the files and rewrite the rows.');
  }
}

function printReport(report) {
  console.log(`APPLIED to ${describeTarget(report.target)}\n`);
  if (report.sameDirectory) {
    console.log('No files were copied (source and destination are the same directory).');
  } else {
    console.log(`Copied:       ${report.summary.copied} file(s), ${(report.summary.bytes / 1024 / 1024).toFixed(1)} MB`);
  }
  console.log(`Rows updated: ${report.summary.rowsUpdated}`);
  if (report.summary.rowsAlreadyAtTarget) {
    console.log(`Already there: ${report.summary.rowsAlreadyAtTarget} row(s) pointed at the new value already`);
  }
  if (report.summary.rowsLeftAsIs) {
    console.log(`Left as-is:   ${report.summary.rowsLeftAsIs} row(s) store a storage key that resolves to the same object`);
  }
  if (report.failures.length) {
    console.log(`\nFailed (${report.failures.length}):`);
    for (const failure of report.failures) console.log(`  ${failure.key}: ${failure.error}`);
  } else {
    console.log('\nNo failures.');
  }
}

(async () => {
  if (args.help) {
    printHelp();
    if (args.error) {
      console.error(`\n${args.error}`);
      process.exit(1);
    }
    process.exit(0);
  }

  try {
    const plan = await planUploadMigration({
      sourceDir: args.source,
      categories: args.categories,
      limit: args.limit,
    });

    if (!args.apply) {
      if (args.json) console.log(JSON.stringify(plan, null, 2));
      else printPlan(plan);
      await pool.end();
      process.exit(0);
    }

    const report = await applyUploadMigration(plan, { verify: args.verify });
    if (args.json) console.log(JSON.stringify({ plan, report }, null, 2));
    else printReport(report);

    await pool.end();
    process.exit(report.failures.length ? 1 : 0);
  } catch (err) {
    console.error(`Migration failed: ${err.message}`);
    await pool.end().catch(() => {});
    process.exit(1);
  }
})();
