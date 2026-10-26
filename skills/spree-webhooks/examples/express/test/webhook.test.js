const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app.
// Spree secret_key values are 64-character hex strings, used as-is (UTF-8) as the HMAC key.
process.env.SPREE_WEBHOOK_SECRET = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

const app = require('../src/index');

const secret = process.env.SPREE_WEBHOOK_SECRET;

const now = () => String(Math.floor(Date.now() / 1000));

/** Hex HMAC-SHA256 of "<timestamp>." + raw body */
function sign(body, timestamp, key = secret) {
  return crypto
    .createHmac('sha256', key)
    .update(Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), Buffer.from(body)]))
    .digest('hex');
}

function eventPayload(name, data = { id: 'or_123' }) {
  return JSON.stringify({
    id: 'evt_01',
    name,
    created_at: '2026-10-26T12:00:00Z',
    data,
    metadata: { spree_version: '6.0.0' },
  });
}

function post(body, { signature, timestamp, contentType = 'application/json' } = {}) {
  const req = request(app).post('/webhooks/spree').set('Content-Type', contentType);
  if (timestamp !== undefined) req.set('X-Spree-Webhook-Timestamp', timestamp);
  if (signature !== undefined) req.set('X-Spree-Webhook-Signature', signature);
  return req.send(body);
}

function signedPost(body, timestamp = now(), opts = {}) {
  return post(body, { signature: sign(body, timestamp), timestamp, ...opts });
}

describe('Spree Webhook Endpoint', () => {
  describe('valid deliveries', () => {
    it.each([
      'order.placed',
      'order.paid',
      'order.canceled',
      'payment.completed',
      'fulfillment.fulfilled',
      'user.created',
      'product.updated',
      'webhook.test',
      'order.some_future_event',
    ])('returns 200 for %s', async (name) => {
      const response = await signedPost(eventPayload(name));
      expect(response.status).toBe(200);
    });

    it('accepts any content type (raw bytes are verified)', async () => {
      const body = eventPayload('order.placed');
      const response = await signedPost(body, now(), { contentType: 'text/plain' });
      expect(response.status).toBe(200);
    });

    it('accepts an uppercase hex signature', async () => {
      const body = eventPayload('order.placed');
      const timestamp = now();
      const response = await post(body, { signature: sign(body, timestamp).toUpperCase(), timestamp });
      expect(response.status).toBe(200);
    });

    it('verifies multi-byte UTF-8 bodies byte for byte', async () => {
      const body = eventPayload('order.placed', { id: 'or_1', note: 'Café ☃ 🚀' });
      const response = await signedPost(body);
      expect(response.status).toBe(200);
    });

    it('verifies the body exactly as sent (extra whitespace is part of the signed bytes)', async () => {
      const body = `  ${eventPayload('order.placed')}\n`;
      const response = await signedPost(body);
      expect(response.status).toBe(200);
    });
  });

  describe('rejected deliveries', () => {
    it('returns 401 for a missing signature', async () => {
      const response = await post(eventPayload('order.placed'), { timestamp: now() });
      expect(response.status).toBe(401);
    });

    it('returns 401 for an empty signature', async () => {
      const response = await post(eventPayload('order.placed'), { signature: '', timestamp: now() });
      expect(response.status).toBe(401);
    });

    it('returns 401 for a missing timestamp', async () => {
      const body = eventPayload('order.placed');
      const response = await post(body, { signature: sign(body, now()) });
      expect(response.status).toBe(401);
    });

    it('returns 401 for an empty timestamp', async () => {
      const body = eventPayload('order.placed');
      const response = await post(body, { signature: sign(body, ''), timestamp: '' });
      expect(response.status).toBe(401);
    });

    it('returns 401 for a signature with the wrong length', async () => {
      const response = await post(eventPayload('order.placed'), { signature: 'abc123', timestamp: now() });
      expect(response.status).toBe(401);
    });

    it('returns 401 for a 64-character non-hex signature', async () => {
      const response = await post(eventPayload('order.placed'), { signature: 'z'.repeat(64), timestamp: now() });
      expect(response.status).toBe(401);
    });

    it('returns 401 for a prefixed signature (the header is a bare digest)', async () => {
      const body = eventPayload('order.placed');
      const timestamp = now();
      const response = await post(body, { signature: `sha256=${sign(body, timestamp)}`, timestamp });
      expect(response.status).toBe(401);
    });

    it('returns 401 for a signature made with the wrong secret', async () => {
      const body = eventPayload('order.placed');
      const timestamp = now();
      const response = await post(body, { signature: sign(body, timestamp, 'wrong_secret'), timestamp });
      expect(response.status).toBe(401);
    });

    it('returns 401 when the secret is hex-decoded instead of used as a string', async () => {
      const body = eventPayload('order.placed');
      const timestamp = now();
      const signature = crypto
        .createHmac('sha256', Buffer.from(secret, 'hex'))
        .update(Buffer.concat([Buffer.from(`${timestamp}.`), Buffer.from(body)]))
        .digest('hex');
      const response = await post(body, { signature, timestamp });
      expect(response.status).toBe(401);
    });

    it('returns 401 for a tampered body', async () => {
      const body = eventPayload('order.placed');
      const timestamp = now();
      const response = await post(eventPayload('order.canceled'), { signature: sign(body, timestamp), timestamp });
      expect(response.status).toBe(401);
    });

    it('returns 401 when the timestamp header differs from the signed one', async () => {
      const body = eventPayload('order.placed');
      const response = await post(body, { signature: sign(body, now()), timestamp: String(Number(now()) + 1) });
      expect(response.status).toBe(401);
    });

    it('returns 401 for a body signed without the timestamp', async () => {
      const body = eventPayload('order.placed');
      const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');
      const response = await post(body, { signature, timestamp: now() });
      expect(response.status).toBe(401);
    });

    it('returns 400 for invalid JSON with a valid signature', async () => {
      const response = await signedPost('not json');
      expect(response.status).toBe(400);
    });
  });

  describe('timestamp tolerance (opt-in)', () => {
    const old = String(Math.floor(Date.now() / 1000) - 3600);

    afterEach(() => {
      delete process.env.SPREE_WEBHOOK_TOLERANCE_SECONDS;
    });

    it('accepts old timestamps by default (retries and replays keep the original)', async () => {
      const response = await signedPost(eventPayload('order.placed'), old);
      expect(response.status).toBe(200);
    });

    it('rejects old timestamps when a tolerance is set', async () => {
      process.env.SPREE_WEBHOOK_TOLERANCE_SECONDS = '300';
      const response = await signedPost(eventPayload('order.placed'), old);
      expect(response.status).toBe(401);
    });

    it('accepts fresh timestamps when a tolerance is set', async () => {
      process.env.SPREE_WEBHOOK_TOLERANCE_SECONDS = '300';
      const response = await signedPost(eventPayload('order.placed'));
      expect(response.status).toBe(200);
    });

    it('treats 0 as off', async () => {
      process.env.SPREE_WEBHOOK_TOLERANCE_SECONDS = '0';
      const response = await signedPost(eventPayload('order.placed'), old);
      expect(response.status).toBe(200);
    });
  });

  describe('GET /health', () => {
    it('returns ok', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });
});
