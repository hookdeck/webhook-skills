const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app.
// Twenty webhook secrets are opaque strings used as-is (UTF-8) as the HMAC key.
process.env.TWENTY_WEBHOOK_SECRET = 'test_twenty_webhook_secret';

const app = require('../src/index');

const webhookSecret = process.env.TWENTY_WEBHOOK_SECRET;

/**
 * Generate a valid X-Twenty-Webhook-Signature: bare hex HMAC-SHA256 of
 * "<timestamp>:" + raw body. The timestamp is Unix milliseconds.
 */
function generateSignature(payload, secret, timestamp) {
  return crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(`${timestamp}:`, 'utf8'), Buffer.from(payload)]))
    .digest('hex');
}

function eventPayload(eventName, id = 'abc12345') {
  return JSON.stringify({
    eventName,
    workspaceId: 'ws_123',
    webhookId: 'wh_123',
    eventDate: '2026-10-26T12:00:00.000Z',
    record: { id, name: 'Acme' },
  });
}

function post(payload, { signature, timestamp, contentType = 'application/json' } = {}) {
  const req = request(app)
    .post('/webhooks/twenty')
    .set('Content-Type', contentType)
    .set('X-Twenty-Webhook-Nonce', 'nonce-123');
  if (signature) req.set('X-Twenty-Webhook-Signature', signature);
  if (timestamp !== undefined) req.set('X-Twenty-Webhook-Timestamp', String(timestamp));
  return req.send(payload);
}

function signed(payload, secret = webhookSecret, timestamp = Date.now()) {
  return { signature: generateSignature(payload, secret, timestamp), timestamp };
}

describe('Twenty Webhook Endpoint', () => {
  afterEach(() => {
    delete process.env.TWENTY_WEBHOOK_TOLERANCE_SECONDS;
  });

  describe('POST /webhooks/twenty', () => {
    it('returns 401 for a missing signature header', async () => {
      const response = await post(eventPayload('person.created'), { timestamp: Date.now() });
      expect(response.status).toBe(401);
    });

    it('returns 401 for a missing timestamp header', async () => {
      const payload = eventPayload('person.created');
      const response = await post(payload, { signature: signed(payload).signature });
      expect(response.status).toBe(401);
    });

    it('returns 401 for an empty timestamp header', async () => {
      const payload = eventPayload('person.created');
      const response = await post(payload, { signature: signed(payload).signature, timestamp: '' });
      expect(response.status).toBe(401);
    });

    it('returns 401 for a signature made with the wrong secret', async () => {
      const payload = eventPayload('person.created');
      const response = await post(payload, signed(payload, 'wrong_secret'));
      expect(response.status).toBe(401);
    });

    it('returns 401 for a tampered body', async () => {
      const payload = eventPayload('person.created');
      const response = await post(payload.replace('Acme', 'Evil'), signed(payload));
      expect(response.status).toBe(401);
    });

    it('returns 401 when the timestamp header differs from the signed one', async () => {
      const payload = eventPayload('person.created');
      const { signature, timestamp } = signed(payload);
      const response = await post(payload, { signature, timestamp: timestamp + 1 });
      expect(response.status).toBe(401);
    });

    it('returns 401 for a signature that is not 64 hex characters', async () => {
      const payload = eventPayload('person.created');
      const { signature, timestamp } = signed(payload);
      for (const bad of [signature.slice(0, 62), `${signature}00`, `sha256=${signature}`, `${signature.slice(0, 63)}z`]) {
        const response = await post(payload, { signature: bad, timestamp });
        expect(response.status).toBe(401);
      }
    });

    it.each([
      'person.created',
      'person.deleted',
      'company.updated',
      'opportunity.updated',
      'note.created',
      'workflow.created',
    ])('returns 200 for a valid %s event', async (eventName) => {
      const payload = eventPayload(eventName);
      const response = await post(payload, signed(payload));
      expect(response.status).toBe(200);
    });

    it('accepts an uppercase hex signature', async () => {
      const payload = eventPayload('person.created');
      const { signature, timestamp } = signed(payload);
      const response = await post(payload, { signature: signature.toUpperCase(), timestamp });
      expect(response.status).toBe(200);
    });

    it('verifies the exact raw bytes (whitespace and non-ASCII are not normalised)', async () => {
      const payload = '{\n  "eventName": "person.created",\n  "record": { "id": "1", "name": "Zoë 😀" }\n}';
      const response = await post(payload, signed(payload));
      expect(response.status).toBe(200);
    });

    it('verifies any content type', async () => {
      const payload = eventPayload('person.created');
      const response = await post(payload, { ...signed(payload), contentType: 'text/plain' });
      expect(response.status).toBe(200);
    });

    it('accepts the docs-style `event` field', async () => {
      const payload = JSON.stringify({ event: 'company.updated', data: { id: 'c1' }, timestamp: '2026-10-26T12:00:00Z' });
      const response = await post(payload, signed(payload));
      expect(response.status).toBe(200);
    });

    it('returns 400 for a validly signed body that is not JSON', async () => {
      const payload = 'not json';
      const response = await post(payload, { ...signed(payload), contentType: 'text/plain' });
      expect(response.status).toBe(400);
    });

    it('does not reject old timestamps by default (retries and replays resend them)', async () => {
      const payload = eventPayload('person.created');
      const response = await post(payload, signed(payload, webhookSecret, Date.now() - 24 * 3600 * 1000));
      expect(response.status).toBe(200);
    });

    it('rejects old timestamps when TWENTY_WEBHOOK_TOLERANCE_SECONDS is set', async () => {
      process.env.TWENTY_WEBHOOK_TOLERANCE_SECONDS = '300';
      const payload = eventPayload('person.created');
      const old = await post(payload, signed(payload, webhookSecret, Date.now() - 10 * 60 * 1000));
      expect(old.status).toBe(401);
      const fresh = await post(payload, signed(payload, webhookSecret, Date.now()));
      expect(fresh.status).toBe(200);
    });

    it('treats the timestamp as milliseconds when a tolerance is set', async () => {
      process.env.TWENTY_WEBHOOK_TOLERANCE_SECONDS = '300';
      const payload = eventPayload('person.created');
      // Unix seconds (1000x too small) would be decades old in milliseconds
      const response = await post(payload, signed(payload, webhookSecret, Math.floor(Date.now() / 1000)));
      expect(response.status).toBe(401);
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
