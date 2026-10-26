const request = require('supertest');

// Set test environment variables before importing the app
process.env.SONIOX_WEBHOOK_HEADER = 'Authorization';
process.env.SONIOX_WEBHOOK_SECRET = 'Bearer test_soniox_secret_0123456789';

const app = require('../src/index');
const { verifySonioxRequest } = require('../src/index');

const SECRET = process.env.SONIOX_WEBHOOK_SECRET;

// Payload as shown in Soniox's docs
function samplePayload(status = 'completed') {
  return { id: '548d023b-2b3d-4dc2-a3ef-cca26d05fd9a', status };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/soniox')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Soniox webhook endpoint', () => {
  describe('auth header verification', () => {
    it('accepts the correct whole header value', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('does not strip a Bearer prefix: the bare token is rejected', async () => {
      const res = await post().set('Authorization', 'test_soniox_secret_0123456789');
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await post().set('Authorization', 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await post().set('Authorization', 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects when the secret is not configured', () => {
      expect(verifySonioxRequest({ authorization: SECRET }, { secret: '' })).toBe(false);
    });

    it('supports a custom header name', () => {
      const opts = { name: 'X-Soniox-Secret', secret: 'abc123' };
      expect(verifySonioxRequest({ 'x-soniox-secret': 'abc123' }, opts)).toBe(true);
      expect(verifySonioxRequest({ authorization: 'abc123' }, opts)).toBe(false);
    });
  });

  describe('statuses', () => {
    it.each(['completed', 'error'])('handles status %s', async (status) => {
      const res = await post(JSON.stringify(samplePayload(status))).set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts an unknown status', async () => {
      const res = await post(JSON.stringify(samplePayload('queued'))).set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('rejects invalid JSON after authentication', async () => {
      const res = await post('not json').set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });

    it('rejects a non-object body', async () => {
      const res = await post('[1,2]').set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for bad JSON without the header', async () => {
      const res = await post('not json');
      expect(res.status).toBe(401);
    });
  });
});
