const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.ZERNIO_WEBHOOK_SECRET = 'test_zernio_secret';

const { app, verifyZernioWebhook, processedEvents } = require('../src/index');

/**
 * Generate a valid Zernio signature: lowercase hex HMAC-SHA256 of the raw body
 */
function generateZernioSignature(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function makePayload(event, extra = {}) {
  return JSON.stringify({
    id: crypto.randomUUID(),
    event,
    timestamp: '2027-01-01T17:00:00Z',
    ...extra,
  });
}

describe('Zernio Webhook Endpoint', () => {
  const secret = process.env.ZERNIO_WEBHOOK_SECRET;

  beforeEach(() => processedEvents.clear());

  describe('verifyZernioWebhook', () => {
    it('returns true for a valid signature', () => {
      const payload = Buffer.from('{"event":"post.published"}');
      expect(verifyZernioWebhook(payload, generateZernioSignature(payload, secret), secret)).toBe(true);
    });

    it('returns false for an invalid signature', () => {
      const payload = Buffer.from('{"event":"post.published"}');
      expect(verifyZernioWebhook(payload, 'invalid', secret)).toBe(false);
    });

    it('returns false for a same-length wrong signature', () => {
      const payload = Buffer.from('{"event":"post.published"}');
      expect(verifyZernioWebhook(payload, 'a'.repeat(64), secret)).toBe(false);
    });

    it('returns false for a missing signature or secret', () => {
      const payload = Buffer.from('{}');
      expect(verifyZernioWebhook(payload, null, secret)).toBe(false);
      expect(verifyZernioWebhook(payload, 'abc', undefined)).toBe(false);
    });

    it('returns false when the body was altered', () => {
      const signature = generateZernioSignature('{"a":1}', secret);
      expect(verifyZernioWebhook(Buffer.from('{"a":2}'), signature, secret)).toBe(false);
    });
  });

  describe('POST /webhooks/zernio', () => {
    it('returns 401 for a missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/zernio')
        .set('Content-Type', 'application/json')
        .send(makePayload('post.published'));

      expect(response.status).toBe(401);
    });

    it('returns 400 for an invalid signature', async () => {
      const response = await request(app)
        .post('/webhooks/zernio')
        .set('Content-Type', 'application/json')
        .set('X-Zernio-Signature', 'invalid')
        .send(makePayload('post.published'));

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('returns 400 for a signature made with the wrong secret', async () => {
      const payload = makePayload('post.published');

      const response = await request(app)
        .post('/webhooks/zernio')
        .set('Content-Type', 'application/json')
        .set('X-Zernio-Signature', generateZernioSignature(payload, 'wrong_secret'))
        .send(payload);

      expect(response.status).toBe(400);
    });

    it.each([
      ['post.scheduled', { post: { id: 'p1', scheduledFor: '2027-01-01T17:00:00Z' } }],
      ['post.published', { post: { id: 'p1', platforms: [] } }],
      ['post.partial', { post: { id: 'p1' } }],
      ['post.failed', { post: { id: 'p1' } }],
      ['post.platform.published', { post: { id: 'p1' } }],
      ['post.platform.failed', { post: { id: 'p1' } }],
      ['message.received', { message: { platform: 'instagram', text: 'hi' } }],
      ['comment.received', { account: { accountId: 'a1' } }],
      ['account.connected', { account: { platform: 'twitter', username: 'acme' } }],
      ['account.disconnected', { account: { disconnectionType: 'unintentional', reason: 'token expired' } }],
      ['webhook.test', { message: 'This is a test webhook from Zernio' }],
    ])('accepts a valid %s event', async (event, extra) => {
      const payload = makePayload(event, extra);

      const response = await request(app)
        .post('/webhooks/zernio')
        .set('Content-Type', 'application/json')
        .set('X-Zernio-Signature', generateZernioSignature(payload, secret))
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('accepts the legacy X-Late-Signature header', async () => {
      const payload = makePayload('post.published');

      const response = await request(app)
        .post('/webhooks/zernio')
        .set('Content-Type', 'application/json')
        .set('X-Late-Signature', generateZernioSignature(payload, secret))
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('acknowledges unhandled events', async () => {
      const payload = makePayload('lead.received');

      const response = await request(app)
        .post('/webhooks/zernio')
        .set('Content-Type', 'application/json')
        .set('X-Zernio-Signature', generateZernioSignature(payload, secret))
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('deduplicates redelivered events', async () => {
      const payload = makePayload('post.published');
      const signature = generateZernioSignature(payload, secret);

      const first = await request(app)
        .post('/webhooks/zernio')
        .set('Content-Type', 'application/json')
        .set('X-Zernio-Signature', signature)
        .send(payload);
      const second = await request(app)
        .post('/webhooks/zernio')
        .set('Content-Type', 'application/json')
        .set('X-Zernio-Signature', signature)
        .send(payload);

      expect(first.text).toBe('OK');
      expect(second.status).toBe(200);
      expect(second.text).toBe('Already processed');
    });

    it('returns 400 for malformed JSON that is correctly signed', async () => {
      const payload = 'not json';

      const response = await request(app)
        .post('/webhooks/zernio')
        .set('Content-Type', 'application/json')
        .set('X-Zernio-Signature', generateZernioSignature(payload, secret))
        .send(payload);

      expect(response.status).toBe(400);
    });
  });
});
