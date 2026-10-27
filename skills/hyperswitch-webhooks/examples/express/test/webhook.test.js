const request = require('supertest');
const crypto = require('crypto');

// payment_response_hash_key is used as UTF-8 bytes (not hex- or base64-decoded).
const SECRET = 'hyperswitch_test_payment_response_hash_key';
process.env.HYPERSWITCH_WEBHOOK_SECRET = SECRET;

const app = require('../src/index');
const { verifyHyperswitchSignature, KNOWN_EVENT_TYPES, processedEventIds } = require('../src/index');

// Sign the way Hyperswitch does: HMAC-SHA512 over the raw body, lowercase hex, no prefix.
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha512', secret).update(body).digest('hex');
}

function post(body, signature = sign(body), contentType = 'application/json') {
  const req = request(app).post('/webhooks/hyperswitch').set('Content-Type', contentType);
  if (signature !== null) req.set('X-Webhook-Signature-512', signature);
  return req.send(body);
}

function eventBody(eventType, eventId = `evt_${eventType}`) {
  return JSON.stringify({
    merchant_id: 'merchant_1',
    event_id: eventId,
    event_type: eventType,
    content: { type: 'payment_details', object: { payment_id: 'pay_123' } },
    timestamp: '2026-10-26T10:00:00.000Z',
  });
}

describe('Hyperswitch webhook handler', () => {
  beforeEach(() => processedEventIds.clear());

  it('has the 33 documented event types', () => {
    expect(KNOWN_EVENT_TYPES.size).toBe(33);
  });

  describe('signature verification', () => {
    it('accepts a valid signature', async () => {
      const res = await post(eventBody('payment_succeeded'));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('accepts an uppercase hex digest', async () => {
      const body = eventBody('payment_succeeded');
      const res = await post(body, sign(body).toUpperCase());
      expect(res.status).toBe(200);
    });

    it('accepts any content type (raw body is read for */*)', async () => {
      const body = eventBody('payment_succeeded');
      const res = await post(body, sign(body), 'text/plain');
      expect(res.status).toBe(200);
    });

    it('verifies the exact bytes, including non-canonical whitespace', async () => {
      const body = '{ "event_id": "evt_ws",   "event_type": "payment_succeeded" }';
      const res = await post(body);
      expect(res.status).toBe(200);
    });

    it('rejects a missing signature with 401', async () => {
      const res = await post(eventBody('payment_succeeded'), null);
      expect(res.status).toBe(401);
    });

    it('rejects an empty signature with 401', async () => {
      const res = await post(eventBody('payment_succeeded'), '');
      expect(res.status).toBe(401);
    });

    it('rejects a wrong secret with 401', async () => {
      const body = eventBody('payment_succeeded');
      const res = await post(body, sign(body, 'wrong_secret'));
      expect(res.status).toBe(401);
    });

    it('rejects a tampered body with 401', async () => {
      const body = eventBody('payment_succeeded');
      const res = await post(body.replace('pay_123', 'pay_999'), sign(body));
      expect(res.status).toBe(401);
    });

    it('rejects a SHA-256 digest with 401', async () => {
      const body = eventBody('payment_succeeded');
      const sha256 = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
      const res = await post(body, sha256);
      expect(res.status).toBe(401);
    });

    it('rejects a prefixed or non-hex signature with 401', async () => {
      const body = eventBody('payment_succeeded');
      expect((await post(body, `sha512=${sign(body)}`)).status).toBe(401);
      expect((await post(body, 'z'.repeat(128))).status).toBe(401);
    });

    it('uses the secret as UTF-8 bytes, not hex-decoded', async () => {
      const body = eventBody('payment_succeeded');
      const decoded = crypto.createHmac('sha512', Buffer.from(SECRET, 'hex')).update(body).digest('hex');
      expect((await post(body, decoded)).status).toBe(401);
    });

    it('returns 500 when the secret is not configured', async () => {
      delete process.env.HYPERSWITCH_WEBHOOK_SECRET;
      try {
        const res = await post(eventBody('payment_succeeded'));
        expect(res.status).toBe(500);
      } finally {
        process.env.HYPERSWITCH_WEBHOOK_SECRET = SECRET;
      }
    });

    it('verifyHyperswitchSignature matches a known-good digest', () => {
      const body = Buffer.from('{"event_type":"payment_succeeded"}');
      expect(verifyHyperswitchSignature(body, sign(body), SECRET).valid).toBe(true);
      expect(verifyHyperswitchSignature(body, sign(body).slice(1), SECRET).valid).toBe(false);
    });
  });

  describe('payload handling', () => {
    it('returns 400 for a signed non-JSON body', async () => {
      const res = await post('not json');
      expect(res.status).toBe(400);
    });

    it.each([...require('../src/index').KNOWN_EVENT_TYPES])('acknowledges %s', async (eventType) => {
      const res = await post(eventBody(eventType));
      expect(res.status).toBe(200);
    });

    it('acknowledges unknown event types', async () => {
      const res = await post(eventBody('some_future_event'));
      expect(res.status).toBe(200);
    });

    it('acknowledges a duplicate event_id without re-processing', async () => {
      const body = eventBody('payment_succeeded', 'evt_dup');
      expect((await post(body)).body).toEqual({ received: true });
      expect((await post(body)).body).toEqual({ received: true, duplicate: true });
    });
  });

  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
