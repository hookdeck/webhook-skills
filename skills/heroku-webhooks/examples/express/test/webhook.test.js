const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.HEROKU_WEBHOOK_SECRET = 'test_heroku_secret';
delete process.env.HEROKU_WEBHOOK_AUTHORIZATION;

const { app, verifyHerokuWebhook } = require('../src/index');

/**
 * Generate a valid Heroku signature: base64(HMAC-SHA256(secret, raw body))
 */
function generateHerokuSignature(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64');
}

function makeEvent(resource, action, data = {}) {
  return JSON.stringify({
    id: 'd472a8bb-1a3c-4f78-aad1-995e6d0022ec',
    action,
    resource,
    data,
    previous_data: {},
    actor: { email: 'dev@example.com', id: 'u1' },
    created_at: '2016-10-26T22:50:14Z',
    webhook_metadata: { event: { include: `api:${resource}` } }
  });
}

describe('Heroku Webhook Endpoint', () => {
  const secret = process.env.HEROKU_WEBHOOK_SECRET;

  describe('verifyHerokuWebhook', () => {
    it('returns true for a valid signature', () => {
      const payload = Buffer.from('{"id":"1"}');
      const sig = generateHerokuSignature(payload, secret);
      expect(verifyHerokuWebhook(payload, sig, secret)).toBe(true);
    });

    it('returns false for an invalid signature', () => {
      expect(verifyHerokuWebhook(Buffer.from('{}'), 'invalid', secret)).toBe(false);
    });

    it('returns false when the header is missing', () => {
      expect(verifyHerokuWebhook(Buffer.from('{}'), undefined, secret)).toBe(false);
    });

    it('returns false for a signature made with another secret', () => {
      const payload = Buffer.from('{}');
      expect(verifyHerokuWebhook(payload, generateHerokuSignature(payload, 'other'), secret)).toBe(false);
    });
  });

  describe('POST /webhooks/heroku', () => {
    it('returns 400 for missing signature', async () => {
      const res = await request(app)
        .post('/webhooks/heroku')
        .set('Content-Type', 'application/json')
        .send(makeEvent('release', 'create'));
      expect(res.status).toBe(400);
      expect(res.text).toBe('Invalid signature');
    });

    it('returns 400 for invalid signature', async () => {
      const res = await request(app)
        .post('/webhooks/heroku')
        .set('Content-Type', 'application/json')
        .set('Heroku-Webhook-Hmac-SHA256', 'invalid')
        .send(makeEvent('release', 'create'));
      expect(res.status).toBe(400);
    });

    it('returns 400 when the body was altered after signing', async () => {
      const signed = makeEvent('release', 'create', { version: 1 });
      const res = await request(app)
        .post('/webhooks/heroku')
        .set('Content-Type', 'application/json')
        .set('Heroku-Webhook-Hmac-SHA256', generateHerokuSignature(signed, secret))
        .send(makeEvent('release', 'create', { version: 2 }));
      expect(res.status).toBe(400);
    });

    it('returns 204 for a valid signature', async () => {
      const payload = makeEvent('release', 'create', { version: 12, status: 'succeeded' });
      const res = await request(app)
        .post('/webhooks/heroku')
        .set('Content-Type', 'application/json')
        .set('Heroku-Webhook-Hmac-SHA256', generateHerokuSignature(payload, secret))
        .send(payload);
      expect(res.status).toBe(204);
    });

    it('handles each documented resource and action', async () => {
      const events = [
        ['api:release', 'create'],
        ['api:release', 'update'],
        ['api:build', 'create'],
        ['api:build', 'update'],
        ['api:app', 'update'],
        ['api:dyno', 'create'],
        ['api:formation', 'update'],
        ['api:formation', 'destroy'],
        ['api:addon-attachment', 'create'],
        ['api:addon-attachment', 'destroy'],
        ['api:domain', 'create']
      ];
      for (const [resource, action] of events) {
        const payload = makeEvent(resource, action);
        const res = await request(app)
          .post('/webhooks/heroku')
          .set('Content-Type', 'application/json')
          .set('Heroku-Webhook-Hmac-SHA256', generateHerokuSignature(payload, secret))
          .send(payload);
        expect(res.status).toBe(204);
      }
    });

    it('returns 400 for a signed body that is not JSON', async () => {
      const payload = 'not json';
      const res = await request(app)
        .post('/webhooks/heroku')
        .set('Content-Type', 'text/plain')
        .set('Heroku-Webhook-Hmac-SHA256', generateHerokuSignature(payload, secret))
        .send(payload);
      expect(res.status).toBe(400);
    });

    describe('with HEROKU_WEBHOOK_AUTHORIZATION set', () => {
      beforeAll(() => { process.env.HEROKU_WEBHOOK_AUTHORIZATION = 'Bearer abc123'; });
      afterAll(() => { delete process.env.HEROKU_WEBHOOK_AUTHORIZATION; });

      it('returns 401 when the Authorization header does not match', async () => {
        const payload = makeEvent('build', 'update');
        const res = await request(app)
          .post('/webhooks/heroku')
          .set('Content-Type', 'application/json')
          .set('Authorization', 'Bearer wrong')
          .set('Heroku-Webhook-Hmac-SHA256', generateHerokuSignature(payload, secret))
          .send(payload);
        expect(res.status).toBe(401);
      });

      it('returns 204 when it matches', async () => {
        const payload = makeEvent('build', 'update');
        const res = await request(app)
          .post('/webhooks/heroku')
          .set('Content-Type', 'application/json')
          .set('Authorization', 'Bearer abc123')
          .set('Heroku-Webhook-Hmac-SHA256', generateHerokuSignature(payload, secret))
          .send(payload);
        expect(res.status).toBe(204);
      });
    });
  });

  describe('GET /health', () => {
    it('returns health status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });
});
