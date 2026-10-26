const request = require('supertest');

// Set test environment variables before importing the app
process.env.TRENDYOL_WEBHOOK_SECRET = 'test_trendyol_api_key_0123456789';

const app = require('../src/index');
const { verifyTrendyolRequest } = require('../src/index');

const SECRET = process.env.TRENDYOL_WEBHOOK_SECRET;

const STATUSES = [
  'CREATED', 'PICKING', 'INVOICED', 'SHIPPED', 'CANCELLED', 'DELIVERED', 'UNDELIVERED',
  'RETURNED', 'UNSUPPLIED', 'AWAITING', 'UNPACKED', 'AT_COLLECTION_POINT', 'VERIFIED'
];

function samplePackage(status = 'Created') {
  return {
    orderNumber: '10654411111',
    shipmentPackageId: 3330111111,
    status,
    shipmentPackageStatus: status,
    cargoProviderName: 'Trendyol Express',
    lines: [{ lineId: 4765111111, quantity: 1, orderLineItemStatusName: status }]
  };
}

function samplePayload(status) {
  return { totalElements: 1, totalPages: 1, page: 0, size: 1, content: [samplePackage(status)] };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/trendyol')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Trendyol webhook endpoint', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  describe('x-api-key verification', () => {
    it('accepts the correct key', async () => {
      const res = await post().set('x-api-key', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('X-API-KEY', SECRET);
      expect(res.status).toBe(200);
    });

    it('rejects a wrong key of the same length', async () => {
      const res = await post().set('x-api-key', 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a key of a different length without throwing', async () => {
      const res = await post().set('x-api-key', 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a key that only starts with the secret', async () => {
      const res = await post().set('x-api-key', `${SECRET}-extra`);
      expect(res.status).toBe(401);
    });

    it('rejects a missing key', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects an empty key', async () => {
      const res = await post().set('x-api-key', '');
      expect(res.status).toBe(401);
    });

    it('does not accept the key as an Authorization header', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(401);
    });

    it('rejects everything when no secret is configured', () => {
      expect(verifyTrendyolRequest({ 'x-api-key': SECRET }, '')).toBe(false);
      expect(verifyTrendyolRequest({ 'x-api-key': SECRET }, null)).toBe(false);
    });

    it('verifies a key containing non-ASCII characters', () => {
      expect(verifyTrendyolRequest({ 'x-api-key': 'anahtar-şğü' }, 'anahtar-şğü')).toBe(true);
      expect(verifyTrendyolRequest({ 'x-api-key': 'anahtar-sgu' }, 'anahtar-şğü')).toBe(false);
    });
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set('x-api-key', SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await post('not json').set('x-api-key', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 when content is not an array', async () => {
      const res = await post(JSON.stringify({ content: {} })).set('x-api-key', SECRET);
      expect(res.status).toBe(400);
    });

    it('checks the key before parsing the body', async () => {
      const res = await post('not json');
      expect(res.status).toBe(401);
    });

    it('accepts an empty content page', async () => {
      const res = await post(JSON.stringify({ content: [] })).set('x-api-key', SECRET);
      expect(res.status).toBe(200);
    });
  });

  describe('status dispatch', () => {
    it.each(STATUSES)('handles %s', async (status) => {
      const res = await post(JSON.stringify(samplePayload(status))).set('x-api-key', SECRET);
      expect(res.status).toBe(200);
      expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled'));
    });

    it('compares the status case-insensitively', async () => {
      const res = await post(JSON.stringify(samplePayload('Delivered'))).set('x-api-key', SECRET);
      expect(res.status).toBe(200);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Package delivered'));
    });

    it('handles every package in content[]', async () => {
      const body = { content: [samplePackage('Created'), samplePackage('Shipped')] };
      const res = await post(JSON.stringify(body)).set('x-api-key', SECRET);
      expect(res.status).toBe(200);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Package created'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Package shipped'));
    });

    it('logs unknown statuses and still returns 200', async () => {
      const res = await post(JSON.stringify(samplePayload('Mystery'))).set('x-api-key', SECRET);
      expect(res.status).toBe(200);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Unhandled package status'));
    });
  });

  it('exposes a health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
