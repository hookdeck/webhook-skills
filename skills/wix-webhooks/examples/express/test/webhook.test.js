const request = require('supertest');
const crypto = require('crypto');

// Generate an RSA keypair to stand in for Wix's signing key. The PUBLIC key goes
// to the app (via env) for verification; the PRIVATE key signs test webhooks.
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// Set env before importing the app (it builds the Wix client at import time).
process.env.WIX_APP_ID = 'test-app-id';
process.env.WIX_PUBLIC_KEY = publicKey;

const { app } = require('../src/index');

const base64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

/**
 * Build a Wix-style webhook JWT: the whole body is a JWT whose `data` claim is a
 * JSON string holding { eventType, instanceId, data }, where the inner `data` is
 * itself a JSON string with the event payload. Signed RS256 — exactly how Wix signs.
 */
function createWixWebhook({ eventType, instanceId = 'inst-1', eventId, entityId = 'order-1', slug = 'created', key = privateKey }) {
  const now = Math.floor(Date.now() / 1000);
  const innerPayload = {
    id: eventId,
    entityFqdn: 'wix.ecom.v1.order',
    slug,
    entityId,
    eventTime: new Date(now * 1000).toISOString(),
    createdEvent: { entity: { id: entityId, number: '10001' } },
  };
  const envelope = { instanceId, eventType, data: JSON.stringify(innerPayload) };
  const jwtPayload = { data: JSON.stringify(envelope), iat: now, exp: now + 300 };

  const header = { alg: 'RS256', typ: 'JWT' };
  const signingInput = `${base64url(header)}.${base64url(jwtPayload)}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), key).toString('base64url');
  return `${signingInput}.${signature}`;
}

describe('Wix Webhook Endpoint', () => {
  let counter = 0;
  const nextId = () => `evt-${Date.now()}-${counter++}`;

  describe('POST /webhooks/wix', () => {
    it('returns 400 when the body is missing', async () => {
      const response = await request(app)
        .post('/webhooks/wix')
        .set('Content-Type', 'text/plain')
        .send('');

      expect(response.status).toBe(400);
    });

    it('returns 400 for an invalid signature (signed with the wrong key)', async () => {
      const { privateKey: wrongKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      const token = createWixWebhook({ eventType: 'wix.ecom.v1.order_created', eventId: nextId(), key: wrongKey });

      const response = await request(app)
        .post('/webhooks/wix')
        .set('Content-Type', 'text/plain')
        .send(token);

      expect(response.status).toBe(400);
    });

    it('returns 400 for a malformed body', async () => {
      const response = await request(app)
        .post('/webhooks/wix')
        .set('Content-Type', 'text/plain')
        .send('not-a-jwt');

      expect(response.status).toBe(400);
    });

    it('returns 200 for a valid order_created webhook', async () => {
      const token = createWixWebhook({ eventType: 'wix.ecom.v1.order_created', eventId: nextId() });

      const response = await request(app)
        .post('/webhooks/wix')
        .set('Content-Type', 'text/plain')
        .send(token);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('handles all subscribed order event types', async () => {
      const events = [
        { eventType: 'wix.ecom.v1.order_created', slug: 'created' },
        { eventType: 'wix.ecom.v1.order_approved', slug: 'approved' },
        { eventType: 'wix.ecom.v1.order_updated', slug: 'updated' },
        { eventType: 'wix.ecom.v1.order_canceled', slug: 'canceled' },
      ];

      for (const { eventType, slug } of events) {
        const token = createWixWebhook({ eventType, slug, eventId: nextId() });
        const response = await request(app)
          .post('/webhooks/wix')
          .set('Content-Type', 'text/plain')
          .send(token);

        expect(response.status).toBe(200);
      }
    });

    it('deduplicates repeated event IDs (still returns 200)', async () => {
      const eventId = nextId();
      const token = createWixWebhook({ eventType: 'wix.ecom.v1.order_created', eventId });

      const first = await request(app).post('/webhooks/wix').set('Content-Type', 'text/plain').send(token);
      const second = await request(app).post('/webhooks/wix').set('Content-Type', 'text/plain').send(token);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200); // duplicate is acknowledged but not reprocessed
    });
  });

  describe('GET /health', () => {
    it('returns health status', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });
});
