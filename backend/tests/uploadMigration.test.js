const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('../src/config/database', () => ({ pool: { query: jest.fn(), end: jest.fn() } }));
jest.mock('../src/services/storageService', () => ({
  saveFile: jest.fn(),
  readFile: jest.fn(),
  urlFor: jest.fn(),
  storageKey: jest.fn(),
  contentTypeFor: jest.fn(),
  isUsingS3: jest.fn(),
}));

// uploadDir() reads UPLOAD_DIR at call time, so the target can be set per test.
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'imizi-migrate-test-'));
const sourceDir = path.join(tempRoot, 'local-uploads');
fs.mkdirSync(path.join(sourceDir, 'plants'), { recursive: true });
fs.mkdirSync(path.join(sourceDir, 'kyc-documents'), { recursive: true });
fs.writeFileSync(path.join(sourceDir, 'plants', 'a.jpg'), 'plant-photo');
fs.writeFileSync(path.join(sourceDir, 'plants', 'b.jpg'), 'second-photo');
fs.writeFileSync(path.join(sourceDir, 'kyc-documents', 'id.pdf'), 'id-document');
fs.writeFileSync(path.join(sourceDir, 'plants', '.hidden.jpg'), 'ignored');

const { pool } = require('../src/config/database');
const storage = require('../src/services/storageService');
const { storageKey } = jest.requireActual('../src/services/storageService');
const {
  listUploadFiles, keyForReference, planUploadMigration, applyUploadMigration,
} = require('../src/services/uploadMigrationService');

const originalEnv = { ...process.env };

/**
 * findReferences selects one column at a time, so fixtures are keyed by
 * "table.column" - otherwise the same rows would be counted once per column.
 */
function mockReferences(fixtures) {
  pool.query.mockImplementation((sql, params) => {
    if (/^\s*UPDATE/i.test(sql)) return Promise.resolve([{ affectedRows: 1 }]);
    const table = /FROM `([a-z_]+)`/.exec(sql)[1];
    const column = /SELECT id, `([a-z_]+)` AS value/.exec(sql)[1];
    return Promise.resolve([fixtures[`${table}.${column}`] || []]);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...originalEnv };
  delete process.env.S3_BUCKET;
  process.env.UPLOAD_DIR = path.join(tempRoot, 'served');

  // clearAllMocks keeps return values, so every mock the service depends on is
  // re-established here rather than leaking from whichever test ran before.
  storage.isUsingS3.mockReturnValue(false);
  storage.urlFor.mockImplementation((key) => `https://bucket.example.com/${key}`);
  storage.storageKey.mockImplementation(storageKey);
  storage.contentTypeFor.mockReturnValue('image/jpeg');
});

afterAll(() => {
  process.env = originalEnv;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('listing local uploads', () => {
  test('walks categories, ignoring hidden files', () => {
    const keys = listUploadFiles(sourceDir).map((f) => f.key);
    expect(keys).toEqual(['kyc-documents/id.pdf', 'plants/a.jpg', 'plants/b.jpg']);
  });

  test('reports a missing folder instead of an empty list', () => {
    expect(() => listUploadFiles(path.join(tempRoot, 'nope'))).toThrow(/not found/);
  });
});

describe('matching stored references', () => {
  const keys = new Set(['plants/a.jpg', 'kyc-documents/id.pdf']);

  test('recognises the local URL form the app writes', () => {
    expect(keyForReference('/uploads/plants/a.jpg', keys)).toBe('plants/a.jpg');
  });

  test('recognises an absolute bucket URL from an earlier migration', () => {
    expect(keyForReference('https://bucket.example.com/plants/a.jpg', keys)).toBe('plants/a.jpg');
  });

  test('recognises the bare key KYC rows store', () => {
    expect(keyForReference('kyc-documents/id.pdf', keys)).toBe('kyc-documents/id.pdf');
  });

  test('leaves unrelated values alone', () => {
    expect(keyForReference('https://lh3.googleusercontent.com/a/avatar.png', keys)).toBeNull();
    expect(keyForReference('/placeholder/12.jpg', keys)).toBeNull();
    expect(keyForReference(null, keys)).toBeNull();
    expect(keyForReference('plants/other.jpg', keys)).toBeNull();
  });
});

describe('planning', () => {
  test('counts the files and the rows that reference them', async () => {
    mockReferences({
      'plant_images.image_url': [
        { id: 1, value: '/uploads/plants/a.jpg' },
        { id: 2, value: '/uploads/plants/b.jpg' },
      ],
      'users.avatar_url': [{ id: 3, value: 'https://lh3.googleusercontent.com/a/x.png' }],
    });

    const plan = await planUploadMigration({ sourceDir });

    expect(plan.summary.filesFound).toBe(3);
    expect(plan.summary.filesSelected).toBe(3);
    expect(plan.summary.references).toBe(2);
    expect(plan.summary.filesWithoutReferences).toBe(1);
    // Disk storage keeps serving the same URL, so nothing needs rewriting.
    const plant = plan.files.find((f) => f.key === 'plants/a.jpg');
    expect(plant.plannedUrl).toBe('/uploads/plants/a.jpg');
    expect(plant.rowsToUpdate).toBe(0);
    expect(plant.rowsAlreadyAtTarget).toBe(1);
  });

  test('flags the same-directory case so nothing is copied pointlessly', async () => {
    mockReferences({});
    process.env.UPLOAD_DIR = sourceDir;

    const plan = await planUploadMigration({ sourceDir });

    expect(plan.sameDirectory).toBe(true);
  });

  test('restricts to a category and honours the limit', async () => {
    mockReferences({});

    const plan = await planUploadMigration({ sourceDir, categories: ['plants'], limit: 1 });

    expect(plan.files.map((f) => f.key)).toEqual(['plants/a.jpg']);
    expect(plan.summary.filesSkippedByFilter).toBe(1);
    expect(plan.summary.filesSkippedByLimit).toBe(1);
  });

  test('writes nothing', async () => {
    mockReferences({});
    await planUploadMigration({ sourceDir });

    expect(storage.saveFile).not.toHaveBeenCalled();
    expect(pool.query.mock.calls.every(([sql]) => sql.trim().toUpperCase().startsWith('SELECT'))).toBe(true);
  });
});

describe('applying', () => {
  test('copies every file through the storage layer', async () => {
    mockReferences({
      'plant_images.image_url': [{ id: 7, value: '/uploads/plants/a.jpg' }],
      'kyc_documents.document_url': [{ id: 9, value: 'kyc-documents/id.pdf' }],
    });
    storage.saveFile.mockImplementation(({ category, filename }) => Promise.resolve(`/uploads/${category}/${filename}`));

    const plan = await planUploadMigration({ sourceDir });
    const report = await applyUploadMigration(plan);

    expect(report.failures).toEqual([]);
    expect(report.summary.copied).toBe(3);

    const plantCall = storage.saveFile.mock.calls.find(([a]) => a.category === 'plants');
    expect(plantCall[0]).toMatchObject({ filename: 'a.jpg', isPrivate: false });

    // KYC documents must never be uploaded as public objects.
    const kycCall = storage.saveFile.mock.calls.find(([a]) => a.category === 'kyc-documents');
    expect(kycCall[0].isPrivate).toBe(true);

    // Disk storage keeps the URL it already had, so no UPDATE is issued.
    expect(report.summary.rowsUpdated).toBe(0);
    expect(report.summary.rowsAlreadyAtTarget).toBe(1);
    // The KYC row holds a storage key, which resolves to the same object.
    expect(report.summary.rowsLeftAsIs).toBe(1);
  });

  test('never repoints a private KYC row, even when storage serves URLs', async () => {
    process.env.S3_BUCKET = 'imizi-uploads';
    storage.isUsingS3.mockReturnValue(true);
    mockReferences({
      'plant_images.image_url': [{ id: 4, value: '/uploads/plants/a.jpg' }],
      'kyc_documents.document_url': [{ id: 9, value: '/uploads/kyc-documents/id.pdf' }],
    });
    storage.saveFile.mockImplementation(({ category, filename }) => Promise.resolve(`https://bucket.example.com/${category}/${filename}`));

    const plan = await planUploadMigration({ sourceDir });
    const report = await applyUploadMigration(plan);
    const updates = pool.query.mock.calls.filter(([sql]) => sql.trim().toUpperCase().startsWith('UPDATE'));

    expect(report.summary.rowsUpdated).toBe(1);
    expect(report.summary.rowsLeftAsIs).toBe(1);
    expect(updates).toHaveLength(1);
    expect(updates[0][0]).toContain('UPDATE `plant_images`');
  });

  test('rewrites rows to bucket URLs when storage serves them from elsewhere', async () => {
    process.env.S3_BUCKET = 'imizi-uploads';
    storage.isUsingS3.mockReturnValue(true);
    mockReferences({ 'plant_images.image_url': [{ id: 4, value: '/uploads/plants/a.jpg' }] });
    storage.saveFile.mockImplementation(({ category, filename }) => Promise.resolve(`https://bucket.example.com/${category}/${filename}`));

    const plan = await planUploadMigration({ sourceDir });
    expect(plan.files.find((f) => f.key === 'plants/a.jpg').plannedUrl).toBe('https://bucket.example.com/plants/a.jpg');

    const report = await applyUploadMigration(plan);
    const update = pool.query.mock.calls.find(([sql]) => sql.trim().toUpperCase().startsWith('UPDATE'));

    expect(report.failures).toEqual([]);
    expect(update[0]).toContain('UPDATE `plant_images` SET `image_url` = ?');
    expect(update[1]).toEqual(['https://bucket.example.com/plants/a.jpg', 4]);
    expect(report.summary.rowsUpdated).toBe(1);
  });

  test('re-running after a rewrite updates nothing', async () => {
    process.env.S3_BUCKET = 'imizi-uploads';
    storage.isUsingS3.mockReturnValue(true);
    mockReferences({
      'plant_images.image_url': [{ id: 4, value: 'https://bucket.example.com/plants/a.jpg' }],
    });
    storage.saveFile.mockImplementation(({ category, filename }) => Promise.resolve(`https://bucket.example.com/${category}/${filename}`));

    const plan = await planUploadMigration({ sourceDir });
    const report = await applyUploadMigration(plan);

    expect(report.summary.rowsUpdated).toBe(0);
    expect(report.summary.rowsAlreadyAtTarget).toBe(1);
  });

  test('a URL mismatch from storage fails that file instead of repointing rows at it', async () => {
    process.env.S3_BUCKET = 'imizi-uploads';
    storage.isUsingS3.mockReturnValue(true);
    mockReferences({ 'plant_images.image_url': [{ id: 4, value: '/uploads/plants/a.jpg' }] });
    storage.saveFile.mockResolvedValue('https://unexpected.example.com/plants/a.jpg');

    const plan = await planUploadMigration({ sourceDir });
    const report = await applyUploadMigration(plan);

    expect(report.failures.map((f) => f.key)).toContain('plants/a.jpg');
    expect(report.summary.rowsUpdated).toBe(0);
    expect(pool.query.mock.calls.some(([sql]) => sql.trim().toUpperCase().startsWith('UPDATE'))).toBe(false);
  });

  test('a file that cannot be uploaded is reported without stopping the rest', async () => {
    mockReferences({});
    storage.saveFile.mockImplementation(({ category, filename }) => (
      filename === 'a.jpg'
        ? Promise.reject(new Error('bucket unreachable'))
        : Promise.resolve(`/uploads/${category}/${filename}`)
    ));

    const plan = await planUploadMigration({ sourceDir });
    const report = await applyUploadMigration(plan);

    expect(report.failures).toEqual([{ key: 'plants/a.jpg', error: 'bucket unreachable' }]);
    expect(report.summary.copied).toBe(2);
    expect(report.summary.failures).toBe(1);
  });

  test('--verify compares what storage actually holds', async () => {
    mockReferences({});
    storage.saveFile.mockImplementation(({ category, filename }) => Promise.resolve(`/uploads/${category}/${filename}`));
    storage.readFile.mockResolvedValue({ buffer: Buffer.from('short'), contentType: 'image/jpeg' });

    const plan = await planUploadMigration({ sourceDir, categories: ['plants'], limit: 1 });
    const report = await applyUploadMigration(plan, { verify: true });

    expect(storage.readFile).toHaveBeenCalledWith('plants/a.jpg');
    expect(report.failures[0].error).toMatch(/verification read 5 bytes, expected 11/);
  });

  test('does not copy when the files are already in the served directory', async () => {
    mockReferences({ 'plant_images.image_url': [{ id: 2, value: '/uploads/plants/a.jpg' }] });
    process.env.UPLOAD_DIR = sourceDir;

    const plan = await planUploadMigration({ sourceDir });
    const report = await applyUploadMigration(plan);

    expect(storage.saveFile).not.toHaveBeenCalled();
    expect(report.sameDirectory).toBe(true);
    expect(report.summary.rowsAlreadyAtTarget).toBe(1);
  });
});
