const request = require('supertest');

// Set test environment variables before importing the app
process.env.PAPERFORM_WEBHOOK_HEADER = 'X-Webhook-Secret';
process.env.PAPERFORM_WEBHOOK_SECRET = 'Bearer test_paperform_secret_0123456789';

const app = require('../src/index');
const { verifyPaperformRequest } = require('../src/index');

const HEADER = process.env.PAPERFORM_WEBHOOK_HEADER;
const SECRET = process.env.PAPERFORM_WEBHOOK_SECRET;

function samplePayload() {
  return {
    data: [
      { title: 'question 1', description: 'First', type: 'address', key: 'ba7ri', custom_key: 'address_1', value: '343 Tester Road' },
      { title: 'question 2', description: null, type: 'text', key: 'tgp8', custom_key: null, value: 'Test 123' },
    ],
    submission_id: 'XXXXXXXXXXXXXXXXXXX',
    created_at: '2017-06-09 09:51:23',
    ip_address: '192.168.10.1',
    charge: null,
  };
}

function post(path = '/webhooks/paperform', body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app).post(path).set('Content-Type', contentType).send(body);
}

describe('Paperform webhook endpoint', () => {
  describe('secret header verification', () => {
    it('accepts the correct header value', async () => {
      const res = await post().set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('x-webhook-secret', SECRET);
      expect(res.status).toBe(200);
    });

    it('compares the whole value, including the Bearer prefix', async () => {
      const res = await post().set(HEADER, SECRET.replace('Bearer ', ''));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await post().set(HEADER, 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await post().set(HEADER, 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects the secret sent under a different header name', async () => {
      const res = await post().set('X-Other', SECRET);
      expect(res.status).toBe(401);
    });
  });

  describe('verifyPaperformRequest', () => {
    it('defaults the header name to Authorization', () => {
      const prev = process.env.PAPERFORM_WEBHOOK_HEADER;
      delete process.env.PAPERFORM_WEBHOOK_HEADER;
      try {
        expect(verifyPaperformRequest({ authorization: 'Bearer abc' }, { secret: 'Bearer abc' })).toBe(true);
      } finally {
        process.env.PAPERFORM_WEBHOOK_HEADER = prev;
      }
    });

    it('rejects everything when no secret is configured', () => {
      expect(verifyPaperformRequest({ 'x-webhook-secret': 'anything' }, { secret: '' })).toBe(false);
    });

    it('handles non-ASCII values', () => {
      expect(verifyPaperformRequest({ 'x-a': 'sécret✓' }, { headerName: 'X-A', secret: 'sécret✓' })).toBe(true);
      expect(verifyPaperformRequest({ 'x-a': 'sécret✗' }, { headerName: 'X-A', secret: 'sécret✓' })).toBe(false);
    });
  });

  describe('payload handling', () => {
    it('accepts any content type', async () => {
      const res = await post('/webhooks/paperform', JSON.stringify(samplePayload()), 'text/plain').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('handles a partial submission webhook (?trigger=partial)', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post('/webhooks/paperform?trigger=partial').set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls[0][0]).toMatch(/^Partial submission/);
      spy.mockRestore();
    });

    it('treats a webhook without ?trigger as a new submission', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await post().set(HEADER, SECRET);
      expect(spy.mock.calls[0][0]).toMatch(/^New submission/);
      spy.mockRestore();
    });

    it('accepts a payment submission with a charge', async () => {
      const body = { ...samplePayload(), charge: { total: '10.00', currency: 'USD' } };
      const res = await post('/webhooks/paperform', JSON.stringify(body)).set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await post('/webhooks/paperform', '{not json').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 when data is not an array', async () => {
      const res = await post('/webhooks/paperform', JSON.stringify({ data: 'x' })).set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('does not parse the body before authenticating', async () => {
      const res = await post('/webhooks/paperform', '{not json');
      expect(res.status).toBe(401);
    });
  });

  it('serves a health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
