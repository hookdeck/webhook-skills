const request = require('supertest');

// Set test environment variables before importing the app
process.env.OMNISEND_WEBHOOK_HEADER = 'X-Webhook-Secret';
process.env.OMNISEND_WEBHOOK_SECRET = 'test_omnisend_secret_0123456789';

const app = require('../src/index');
const { verifyOmnisendRequest } = require('../src/index');

const SECRET = process.env.OMNISEND_WEBHOOK_SECRET;

function samplePayload(event = 'subscribed') {
  return { contactEmail: 'jane@example.com', contactName: 'Jane', event };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/omnisend')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Omnisend webhook endpoint', () => {
  describe('shared secret header verification', () => {
    it('accepts the correct secret', async () => {
      const res = await post().set('X-Webhook-Secret', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('x-webhook-secret', SECRET);
      expect(res.status).toBe(200);
    });

    it('rejects a wrong secret of the same length', async () => {
      const res = await post().set('X-Webhook-Secret', 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a secret of a different length without throwing', async () => {
      const res = await post().set('X-Webhook-Secret', 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects a non-ASCII value without throwing', async () => {
      expect(verifyOmnisendRequest({ 'x-webhook-secret': 'sécret-ünïcode' })).toBe(false);
    });

    it('compares the whole value and does not strip a Bearer prefix', async () => {
      const res = await post().set('X-Webhook-Secret', `Bearer ${SECRET}`);
      expect(res.status).toBe(401);
    });
  });

  describe('Bearer-style secret', () => {
    const opts = { headerName: 'Authorization', secret: 'Bearer abc123' };

    it('accepts the exact whole value', () => {
      expect(verifyOmnisendRequest({ authorization: 'Bearer abc123' }, opts)).toBe(true);
    });

    it('rejects the value without the prefix', () => {
      expect(verifyOmnisendRequest({ authorization: 'abc123' }, opts)).toBe(false);
    });
  });

  describe('custom header name', () => {
    it('reads the header name from configuration', () => {
      const opts = { headerName: 'X-Omnisend-Key', secret: 's3cret' };
      expect(verifyOmnisendRequest({ 'x-omnisend-key': 's3cret' }, opts)).toBe(true);
      expect(verifyOmnisendRequest({ 'x-webhook-secret': 's3cret' }, opts)).toBe(false);
    });
  });

  describe('unconfigured secret', () => {
    it('fails closed', () => {
      expect(verifyOmnisendRequest({ 'x-webhook-secret': 'anything' }, { secret: '' })).toBe(false);
    });
  });

  describe('request handling', () => {
    it.each(['subscribed', 'placed order', 'something custom'])('handles event %s', async (event) => {
      const res = await post(JSON.stringify(samplePayload(event))).set('X-Webhook-Secret', SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts any content type', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set('X-Webhook-Secret', SECRET);
      expect(res.status).toBe(200);
    });

    it('checks the secret before parsing the body', async () => {
      const res = await post('not json').set('X-Webhook-Secret', 'wrong');
      expect(res.status).toBe(401);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await post('not json').set('X-Webhook-Secret', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object body', async () => {
      const res = await post('[1,2]').set('X-Webhook-Secret', SECRET);
      expect(res.status).toBe(400);
    });

    it('serves /health', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
    });
  });
});
