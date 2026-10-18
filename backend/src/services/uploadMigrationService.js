const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');
const { uploadDir } = require('../config/paths');
const {
  saveFile, readFile, urlFor, storageKey, contentTypeFor, isUsingS3,
} = require('./storageService');

/**
 * One-off migration: copies the files that were uploaded while the app was
 * running on a developer machine (backend/uploads) into whatever storage the
 * deployment actually uses, and repoints the database rows at the new URLs.
 *
 * Two things are deliberately separate here:
 *  - copying files, which is needed whenever the target storage is somewhere
 *    other than that local folder (an S3-compatible bucket, or a mounted volume
 *    on the server);
 *  - rewriting URLs, which is only needed when the storage layer returns a
 *    different URL for the same file (bucket URLs), not for disk storage where
 *    a file is still served as /uploads/<category>/<name>.
 *
 * Planning never writes: it reads the database, resolves the URL each file will
 * have, and reports what applying would change.
 */

// Every column that can reference an uploaded file. Identifiers are interpolated
// into the query rather than bound (MySQL cannot bind them) - the values come
// from this hardcoded list, never from input.
//
// `shape` is how that column stores the reference: 'url' means whatever
// saveFile returned (/uploads/<key> on disk, the bucket URL otherwise), 'key'
// means the bare storage key.
const REFERENCE_COLUMNS = [
  { table: 'plant_images', column: 'image_url', shape: 'url' },
  { table: 'plant_images', column: 'ar_model_url', shape: 'url' },
  { table: 'design_images', column: 'image_url', shape: 'url' },
  { table: 'design_images', column: 'ar_model_url', shape: 'url' },
  { table: 'categories', column: 'image_url', shape: 'url' },
  { table: 'users', column: 'avatar_url', shape: 'url' },
  { table: 'work_report_photos', column: 'photo_url', shape: 'url' },
  // KYC documents are stored as a bare key (never a public URL) and read back
  // through the authenticated endpoint, so the copy is private and the value
  // stays a key.
  { table: 'kyc_documents', column: 'document_url', shape: 'key' },
];

const PRIVATE_CATEGORIES = new Set(['kyc-documents']);

function listUploadFiles(sourceDir) {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Uploads folder not found: ${sourceDir}`);
  }
  const files = [];
  for (const category of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (!category.isDirectory() || category.name.startsWith('.')) continue;
    const categoryDir = path.join(sourceDir, category.name);
    for (const entry of fs.readdirSync(categoryDir, { withFileTypes: true })) {
      if (!entry.isFile() || entry.name.startsWith('.')) continue;
      const fullPath = path.join(categoryDir, entry.name);
      files.push({
        category: category.name,
        filename: entry.name,
        key: `${category.name}/${entry.name}`,
        fullPath,
        size: fs.statSync(fullPath).size,
      });
    }
  }
  return files.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Maps a stored value onto one of the keys being migrated. Returns null for
 * anything that is not one of those files (an external avatar URL from Google,
 * a legacy "/placeholder/x.jpg", a value already pointing elsewhere), so those
 * rows are left untouched instead of being rewritten blindly.
 */
function keyForReference(value, knownKeys) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const candidates = [value];
  const withoutScheme = value.replace(/^https?:\/\/[^/]+\//i, '').replace(/^\//, '');
  candidates.push(withoutScheme);
  candidates.push(withoutScheme.replace(/^uploads\//, ''));
  candidates.push(storageKey(value));
  return candidates.find((candidate) => knownKeys.has(candidate)) || null;
}

async function findReferences(knownKeys) {
  const byKey = new Map();
  for (const key of knownKeys) byKey.set(key, []);

  for (const { table, column, shape } of REFERENCE_COLUMNS) {
    const [rows] = await pool.query(`SELECT id, \`${column}\` AS value FROM \`${table}\` WHERE \`${column}\` IS NOT NULL`);
    for (const row of rows) {
      const key = keyForReference(row.value, knownKeys);
      if (key) byKey.get(key).push({ table, column, shape, id: row.id, value: row.value });
    }
  }
  return byKey;
}

/**
 * The value a row should hold after the file lives in the target storage, or
 * null to mean "leave this row alone".
 *
 * A 'key' column holds a bare storage key that the storage layer resolves to the
 * same object whatever the backend is, and only the authenticated KYC endpoint
 * reads it - repointing it at a URL would gain nothing and would store a
 * public-looking address for a private document. Those rows are reported, not
 * rewritten.
 */
function referenceValue(file, reference) {
  return reference.shape === 'key' ? null : file.plannedUrl;
}

function targetDescription() {
  const dir = uploadDir();
  if (isUsingS3()) {
    return {
      kind: 's3',
      bucket: process.env.S3_BUCKET,
      // Derived from the storage layer's own URL builder (with an empty key and
      // its trailing slash removed) so a preview cannot drift from what saveFile
      // actually returns.
      urlBase: urlFor('').replace(/\/$/, ''),
    };
  }
  return { kind: 'disk', directory: dir };
}

/**
 * Works out what would happen without changing anything.
 *
 * options.sourceDir  the folder to copy from (defaults to the app's uploads dir)
 * options.categories restrict to specific categories
 * options.limit      stop after N files
 */
async function planUploadMigration(options = {}) {
  // Defaults to the folder the app used before it had other storage - NOT to
  // UPLOAD_DIR, which is where files are going: defaulting to the destination
  // would make every run a copy of a folder onto itself.
  const sourceDir = path.resolve(options.sourceDir || './uploads');
  const target = targetDescription();
  const allFiles = listUploadFiles(sourceDir);
  const wanted = allFiles.filter((f) => !options.categories?.length || options.categories.includes(f.category));
  const considered = options.limit ? wanted.slice(0, options.limit) : wanted;

  const references = await findReferences(new Set(considered.map((f) => f.key)));

  // Copying a file onto itself is pointless, which happens when UPLOAD_DIR is
  // the same folder that is being migrated (the normal case on a dev machine).
  const sameDirectory = target.kind === 'disk' && target.directory === sourceDir;

  const files = considered.map((entry) => {
    const plannedUrl = target.kind === 's3' ? urlFor(entry.key) : `/uploads/${entry.key}`;
    const refs = references.get(entry.key) || [];
    const file = { key: entry.key, size: entry.size, plannedUrl };
    return {
      ...file,
      // The stored value travels with the plan so applying does not have to
      // re-read the database (and so --json shows exactly what changes).
      references: refs.map((ref) => ({ table: ref.table, column: ref.column, shape: ref.shape, id: ref.id, value: ref.value })),
      rowsToUpdate: refs.filter((ref) => { const to = referenceValue(file, ref); return to !== null && ref.value !== to; }).length,
      rowsAlreadyAtTarget: refs.filter((ref) => { const to = referenceValue(file, ref); return to !== null && ref.value === to; }).length,
      rowsLeftAsIs: refs.filter((ref) => referenceValue(file, ref) === null).length,
    };
  });

  return {
    target,
    sourceDir,
    sameDirectory,
    files,
    summary: {
      filesFound: allFiles.length,
      filesSelected: files.length,
      filesSkippedByFilter: allFiles.length - wanted.length,
      filesSkippedByLimit: wanted.length - considered.length,
      bytes: files.reduce((sum, f) => sum + f.size, 0),
      references: files.reduce((sum, f) => sum + f.references.length, 0),
      rowsToUpdate: files.reduce((sum, f) => sum + f.rowsToUpdate, 0),
      rowsAlreadyAtTarget: files.reduce((sum, f) => sum + f.rowsAlreadyAtTarget, 0),
      rowsLeftAsIs: files.reduce((sum, f) => sum + f.rowsLeftAsIs, 0),
      filesWithoutReferences: files.filter((f) => !f.references.length).length,
    },
  };
}

/**
 * Copies the files and rewrites the rows the plan found. Safe to re-run: files
 * that are already stored are overwritten with identical bytes and rows that
 * already hold the new URL are left alone.
 *
 * options.verify re-reads every uploaded file through the storage layer and
 * compares its size, to catch a bucket that silently rejected a write.
 */
async function applyUploadMigration(plan, options = {}) {
  const uploaded = [];
  const failures = [];
  const updated = [];
  const unchanged = [];
  const leftAsIs = [];

  for (const file of plan.files) {
    const absolute = path.resolve(plan.sourceDir, file.key);
    try {
      if (!plan.sameDirectory) {
        const buffer = fs.readFileSync(absolute);
        const storedUrl = await saveFile({
          category: file.key.split('/')[0],
          filename: path.basename(file.key),
          buffer,
          mimetype: contentTypeFor(file.key),
          isPrivate: PRIVATE_CATEGORIES.has(file.key.split('/')[0]),
        });
        if (storedUrl !== file.plannedUrl) {
          // The preview and the real storage disagreed, so the rows must not be
          // repointed at a URL that was never produced.
          throw new Error(`storage returned ${storedUrl} but ${file.plannedUrl} was planned`);
        }
        if (options.verify) {
          const readBack = await readFile(file.key);
          if (readBack.buffer.length !== file.size) {
            throw new Error(`verification read ${readBack.buffer.length} bytes, expected ${file.size}`);
          }
        }
      }

      for (const ref of file.references) {
        const to = referenceValue(file, ref);
        if (to === null) {
          leftAsIs.push({ key: file.key, ...ref });
          continue;
        }
        if (ref.value === to) {
          unchanged.push({ key: file.key, ...ref });
          continue;
        }
        await pool.query(`UPDATE \`${ref.table}\` SET \`${ref.column}\` = ? WHERE id = ?`, [to, ref.id]);
        updated.push({ key: file.key, ...ref, to });
      }

      uploaded.push({ key: file.key, size: file.size, storedAs: file.plannedUrl, copied: !plan.sameDirectory });
    } catch (err) {
      failures.push({ key: file.key, error: err.message });
    }
  }

  return {
    target: plan.target,
    sourceDir: plan.sourceDir,
    sameDirectory: plan.sameDirectory,
    uploaded,
    updated,
    unchanged,
    leftAsIs,
    failures,
    summary: {
      files: plan.files.length,
      bytes: plan.files.reduce((sum, f) => sum + f.size, 0),
      copied: uploaded.filter((f) => f.copied).length,
      rowsUpdated: updated.length,
      rowsAlreadyAtTarget: unchanged.length,
      rowsLeftAsIs: leftAsIs.length,
      failures: failures.length,
    },
  };
}

module.exports = {
  REFERENCE_COLUMNS,
  PRIVATE_CATEGORIES,
  listUploadFiles,
  keyForReference,
  referenceValue,
  findReferences,
  planUploadMigration,
  applyUploadMigration,
};
