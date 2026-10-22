const request = require('supertest');
const crypto = require('crypto');

// Middesk secrets are arbitrary strings (e.g. whsec_... or sec_...) used whole as the key.
process.env.MIDDESK_WEBHOOK_SECRET = 'whsec_abcdef123456';

const { app, verifyMiddeskWebhook } = require('../src/index');

// Real Middesk algorithm: bare hex HMAC-SHA256 of the raw body, secret as UTF-8 string.
function generateSignature(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function eventPayload(type, objectOverrides = {}) {
  return JSON.stringify({
    object: 'event',
    id: 'f215a707-655e-400f-84e6-fbb949f5612a',
    type,
    data: {
      object: {
        id: '0f86dab5-8195-4b95-b3c0-19deaeba2a8e',
        object: 'business',
        name: 'A Company',
        status: 'open',
        ...objectOverrides,
      },
    },
    created_at: '2020-01-02T23:54:48.239Z',
  });
}

describe('Middesk Webhook Endpoint', () => {
  const secret = process.env.MIDDESK_WEBHOOK_SECRET;

  describe('verifyMiddeskWebhook', () => {
    it('accepts a valid signature', () => {
      const payload = Buffer.from(eventPayload('business.created'));
      expect(verifyMiddeskWebhook(payload, generateSignature(payload, secret), secret)).toBe(true);
    });

    it('uses the whole secret as UTF-8 (no whsec_ stripping or base64 decoding)', () => {
      const payload = Buffer.from(eventPayload('business.created'));
      const stripped = generateSignature(payload, 'abcdef123456');
      const decoded = crypto
        .createHmac('sha256', Buffer.from('abcdef123456', 'base64'))
        .update(payload)
        .digest('hex');
      expect(verifyMiddeskWebhook(payload, stripped, secret)).toBe(false);
      expect(verifyMiddeskWebhook(payload, decoded, secret)).toBe(false);
    });

    it('rejects a wrong secret', () => {
      const payload = Buffer.from(eventPayload('business.created'));
      expect(verifyMiddeskWebhook(payload, generateSignature(payload, 'sec_wrong'), secret)).toBe(false);
    });

    it('rejects a modified body', () => {
      const payload = Buffer.from(eventPayload('business.created'));
      const signature = generateSignature(payload, secret);
      expect(verifyMiddeskWebhook(Buffer.from(eventPayload('business.updated')), signature, secret)).toBe(false);
    });

    it('rejects missing, malformed or wrong-length signatures', () => {
      const payload = Buffer.from(eventPayload('business.created'));
      expect(verifyMiddeskWebhook(payload, undefined, secret)).toBe(false);
      expect(verifyMiddeskWebhook(payload, 'not-hex', secret)).toBe(false);
      expect(verifyMiddeskWebhook(payload, 'abcd', secret)).toBe(false);
    });
  });

  describe('POST /webhooks/middesk', () => {
    const post = (payload, signature, contentType = 'application/json') => {
      const req = request(app).post('/webhooks/middesk').set('Content-Type', contentType);
      if (signature) req.set('X-Middesk-Signature-256', signature);
      return req.send(payload);
    };

    it.each([
      'business.created',
      'business.updated',
      'order.created',
      'order.updated',
      'monitor.created',
      'monitor.updated',
      'tin.retried',
      'lien.updated',
    ])('handles %s', async (type) => {
      const payload = eventPayload(type);
      const res = await post(payload, generateSignature(payload, secret));
      expect(res.status).toBe(200);
    });

    it('returns 200 for unhandled event types', async () => {
      const payload = eventPayload('person.created');
      const res = await post(payload, generateSignature(payload, secret));
      expect(res.status).toBe(200);
    });

    it('verifies regardless of content type', async () => {
      const payload = eventPayload('business.created');
      const res = await post(payload, generateSignature(payload, secret), 'text/plain');
      expect(res.status).toBe(200);
    });

    it('returns 400 for an invalid signature', async () => {
      const res = await post(eventPayload('business.created'), 'a'.repeat(64));
      expect(res.status).toBe(400);
    });

    it('returns 400 when the signature header is missing', async () => {
      const res = await post(eventPayload('business.created'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a validly signed non-JSON body', async () => {
      const payload = 'not json';
      const res = await post(payload, generateSignature(payload, secret), 'text/plain');
      expect(res.status).toBe(400);
    });
  });

  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
