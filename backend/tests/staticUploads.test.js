const fs = require('fs');
const os = require('os');
const path = require('path');

// The uploads directory is read when the app module loads, so it has to be
// pointed at a fixture directory first.
const uploadFixture = fs.mkdtempSync(path.join(os.tmpdir(), 'imizi-uploads-'));
fs.writeFileSync(path.join(uploadFixture, 'sample.txt'), 'hello');
fs.mkdirSync(path.join(uploadFixture, 'kyc-documents'), { recursive: true });
fs.writeFileSync(path.join(uploadFixture, 'kyc-documents', 'private.pdf'), 'secret');
process.env.UPLOAD_DIR = uploadFixture;

jest.mock('../src/config/database', () => ({ pool: { query: jest.fn(), getConnection: jest.fn() } }));

const request = require('supertest');
const app = require('../src/app');

afterAll(() => fs.rmSync(uploadFixture, { recursive: true, force: true }));

describe('serving public uploads', () => {
  test('uploaded files may be embedded by another origin', async () => {
    const res = await request(app).get('/uploads/sample.txt');

    expect(res.status).toBe(200);
    // Without this, helmet's default `same-origin` makes the browser reject the
    // response when the frontend is served from a different domain.
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  test('everything else keeps the stricter default', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
  });

  test('KYC documents are still unreachable through the static route', async () => {
    const res = await request(app).get('/uploads/kyc-documents/private.pdf');
    expect(res.status).toBe(404);
  });

  test('an encoded path cannot slip past the KYC guard', async () => {
    const res = await request(app).get('/uploads/%6byc-documents/private.pdf');
    expect(res.status).toBe(404);
  });
});
