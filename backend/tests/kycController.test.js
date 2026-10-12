jest.mock('../src/config/database', () => ({ pool: { query: jest.fn() } }));
jest.mock('../src/services/auditService', () => ({ recordAudit: jest.fn() }));
jest.mock('../src/services/notificationService', () => ({ notify: jest.fn(), broadcastToRole: jest.fn() }));
jest.mock('../src/services/emailService', () => ({ sendEmail: jest.fn() }));
jest.mock('../src/services/storageService', () => ({ saveFile: jest.fn(), deleteFile: jest.fn(), readFile: jest.fn() }));

const { pool } = require('../src/config/database');
const { readFile } = require('../src/services/storageService');
const { getDocumentFile, getUserDocuments, listPending } = require('../src/controllers/kycController');

function response() {
  return { set: jest.fn(), send: jest.fn() };
}

describe('KYC document access and district scoping', () => {
  beforeEach(() => jest.clearAllMocks());

  test('customer cannot download another customer’s document', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 11, user_id: 99, document_url: 'kyc-documents/id.pdf' }]]);
    const res = response();
    const next = jest.fn();

    await getDocumentFile({ params: { documentId: '11' }, user: { id: 3, role: 'customer' } }, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    expect(readFile).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });

  test('manager cannot view KYC documents for a different district', async () => {
    pool.query
      .mockResolvedValueOnce([[{ district_id: 1 }]])
      .mockResolvedValueOnce([[{ district_id: 2 }]]);
    const next = jest.fn();

    await getUserDocuments({ params: { userId: '40' }, user: { id: 5, role: 'manager' } }, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  test('manager pending list is filtered to their district', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const res = { json: jest.fn() };
    const next = jest.fn();

    await listPending({ user: { role: 'manager', districtId: 4 } }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(pool.query.mock.calls[0][0]).toContain('AND u.district_id = ?');
    expect(pool.query.mock.calls[0][1]).toEqual([4]);
  });
});
