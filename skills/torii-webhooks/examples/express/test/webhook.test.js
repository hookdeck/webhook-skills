const request = require('supertest');

// Set test environment variables before importing the app
process.env.TORII_WEBHOOK_HEADER = 'Authorization';
process.env.TORII_WEBHOOK_SECRET = 'Bearer test_torii_secret_0123456789';

const app = require('../src/index');
const { verifyToriiRequest } = require('../src/index');

const SECRET = process.env.TORII_WEBHOOK_SECRET;

// Illustrative bodies: Torii defines no event field; these are made-up workflow templates.
const BODIES = [
  { workflow: 'new app discovered', app: { name: 'Example App' } },
  { workflow: 'user offboarding', user: { email: 'jane@example.com' } },
];

function post(body = JSON.stringify(BODIES[0]), contentType = 'application/json') {
  return request(app).post('/webhooks/torii').set('Content-Type', contentType).send(body);
}

describe('Torii custom action endpoint', () => {
  describe('credential header verification', () => {
    it('accepts the exact whole header value', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('rejects a missing header with 401', async () => {
      expect((await post()).status).toBe(401);
    });

    it('rejects a wrong value with 401', async () => {
      expect((await post().set('Authorization', 'Bearer nope')).status).toBe(401);
    });

    it('does not strip a Bearer prefix (whole-value compare)', async () => {
      const res = await post().set('Authorization', 'test_torii_secret_0123456789');
      expect(res.status).toBe(401);
    });

    it('rejects a different-length value without throwing', async () => {
      expect((await post().set('Authorization', 'x')).status).toBe(401);
    });

    it('rejects when the secret is not configured', () => {
      expect(verifyToriiRequest({ authorization: 'anything' }, '')).toBe(false);
      expect(verifyToriiRequest({ authorization: 'anything' }, undefined)).toBe(false);
    });

    it('honours a custom header name', () => {
      expect(verifyToriiRequest({ 'x-torii-key': 'abc' }, 'abc', 'X-Torii-Key')).toBe(true);
      expect(verifyToriiRequest({ authorization: 'abc' }, 'abc', 'X-Torii-Key')).toBe(false);
    });
  });

  describe('methods and bodies', () => {
    it.each(['put', 'patch', 'delete'])('accepts %s', async (method) => {
      const res = await request(app)[method]('/webhooks/torii')
        .set('Authorization', SECRET)
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(BODIES[1]));
      expect(res.status).toBe(200);
    });

    it('accepts GET with an empty body', async () => {
      const res = await request(app).get('/webhooks/torii').set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts POST with an empty body', async () => {
      const res = await request(app).post('/webhooks/torii').set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('rejects unauthenticated GET with 401', async () => {
      expect((await request(app).get('/webhooks/torii')).status).toBe(401);
    });

    it('rejects other methods with 405', async () => {
      const res = await request(app).head('/webhooks/torii').set('Authorization', SECRET);
      expect(res.status).toBe(405);
    });

    it.each(BODIES.map((b) => [b.workflow, b]))('handles "%s"', async (_name, body) => {
      const res = await post(JSON.stringify(body)).set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts any content type', async () => {
      const res = await post(JSON.stringify(BODIES[0]), 'text/plain').set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authentication', async () => {
      const res = await post('{not json').set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });

    it('authenticates before parsing (bad JSON, no credential -> 401)', async () => {
      expect((await post('{not json')).status).toBe(401);
    });
  });
});
