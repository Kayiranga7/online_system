jest.mock('../src/config/database', () => ({ pool: { query: jest.fn() } }));
jest.mock('../src/services/auditService', () => ({ recordAudit: jest.fn() }));

const { pool } = require('../src/config/database');
const { normalizeImageUrl, isPlaceholderImageUrl, stripPlaceholderImages } = require('../src/utils/media');
const { addPlantImage } = require('../src/controllers/plantController');
const { addDesignImage } = require('../src/controllers/designController');

beforeEach(() => jest.clearAllMocks());

describe('placeholder image paths', () => {
  test('recognises the invented paths a previous version stored', () => {
    expect(isPlaceholderImageUrl('/placeholder/12.jpg')).toBe(true);
    expect(isPlaceholderImageUrl('/api/placeholder/300/220')).toBe(true);
    expect(isPlaceholderImageUrl('/uploads/plants/real.webp')).toBe(false);
    expect(isPlaceholderImageUrl(null)).toBe(false);
  });

  test('normalises them, and empty values, to null', () => {
    expect(normalizeImageUrl('/placeholder/7.jpg')).toBeNull();
    expect(normalizeImageUrl('/api/placeholder/300/220')).toBeNull();
    expect(normalizeImageUrl('')).toBeNull();
    expect(normalizeImageUrl('   ')).toBeNull();
    expect(normalizeImageUrl(undefined)).toBeNull();
    expect(normalizeImageUrl('/uploads/designs/real.jpg')).toBe('/uploads/designs/real.jpg');
  });

  test('strips them from the rows a controller is about to return', () => {
    const rows = [
      { id: 1, primary_image: '/placeholder/1.jpg' },
      { id: 2, primary_image: '/uploads/plants/keep.webp' },
    ];
    const images = [{ image_url: '/placeholder/1.jpg', ar_model_url: '/uploads/models/a.glb' }];

    stripPlaceholderImages(rows);
    stripPlaceholderImages(images);

    expect(rows[0].primary_image).toBeNull();
    expect(rows[1].primary_image).toBe('/uploads/plants/keep.webp');
    expect(images[0].image_url).toBeNull();
    // An AR-only row keeps its model - only the fake image path is dropped.
    expect(images[0].ar_model_url).toBe('/uploads/models/a.glb');
  });

  test('tolerates a single row, a missing row and a row without image fields', () => {
    expect(stripPlaceholderImages({ primary_image: '/placeholder/1.jpg' }).primary_image).toBeNull();
    expect(stripPlaceholderImages(undefined)).toBeUndefined();
    expect(() => stripPlaceholderImages([null, 5, { id: 1 }])).not.toThrow();
  });
});

describe('attaching media without a photo', () => {
  test('an AR-only plant image stores NULL, not an invented path', async () => {
    pool.query.mockResolvedValueOnce([{ insertId: 3 }]);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await addPlantImage(
      { params: { id: '12' }, body: { arModelUrl: '/uploads/models/a.glb' }, user: { id: 1 }, headers: {} },
      res,
      jest.fn()
    );

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO plant_images');
    expect(params).toEqual(['12', null, '/uploads/models/a.glb', false]);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('an AR-only design image stores NULL, not an invented path', async () => {
    pool.query.mockResolvedValueOnce([{ insertId: 4 }]);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await addDesignImage(
      { params: { id: '9' }, body: { arModelUrl: '/uploads/models/b.glb' }, user: { id: 1 }, headers: {} },
      res,
      jest.fn()
    );

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO design_images');
    expect(params).toEqual(['9', null, '/uploads/models/b.glb', false]);
  });

  test('still rejects a request with neither an image nor a model', async () => {
    const next = jest.fn();

    await addPlantImage({ params: { id: '12' }, body: {}, user: { id: 1 }, headers: {} }, {}, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    expect(pool.query).not.toHaveBeenCalled();
  });
});
