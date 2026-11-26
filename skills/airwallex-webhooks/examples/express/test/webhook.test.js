const request = require('supertest');
const crypto = require('crypto');

// Set the webhook secret before importing the app.
process.env.AIRWALLEX_WEBHOOK_SECRET = 'test_secret';

const app = require('../src/index');

const WEBHOOK_SECRET = process.env.AIRWALLEX_WEBHOOK_SECRET;

/**
 * Generate a valid Airwallex signature for testing.
 * Mirrors the provider: HMAC-SHA256 over (x-timestamp + raw_body), hex-encoded.
 */
function sign(payload, secret, timestamp = String(Date.now())) {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(timestamp)
    .update(payload)
    .digest('hex');
  return { timestamp, signature };
}

function eventPayload(name, objectId = 'int_test_123') {
  return JSON.stringify({
    id: 'evt_test_123',
    name,
    account_id: 'acct_test_123',
    data: { object: { id: objectId, status: 'SUCCEEDED' } },
    created_at: '2026-07-24T12:34:56+0000',
  });
}

describe('Airwallex Webhook Endpoint', () => {
  describe('POST /webhooks/airwallex', () => {
    it('returns 400 when signature headers are missing', async () => {
      const res = await request(app)
        .post('/webhooks/airwallex')
        .set('Content-Type', 'application/json')
        .send(eventPayload('payment_intent.succeeded'));

      expect(res.status).toBe(400);
    });

    it('returns 400 for an invalid signature', async () => {
      const payload = eventPayload('payment_intent.succeeded');
      const res = await request(app)
        .post('/webhooks/airwallex')
        .set('Content-Type', 'application/json')
        .set('x-timestamp', String(Date.now()))
        .set('x-signature', 'deadbeef')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.text).toContain('Invalid signature');
    });

    it('returns 400 for a tampered payload', async () => {
      const original = eventPayload('payment_intent.succeeded', 'int_original');
      const { timestamp, signature } = sign(original, WEBHOOK_SECRET);
      const tampered = eventPayload('payment_intent.succeeded', 'int_tampered');

      const res = await request(app)
        .post('/webhooks/airwallex')
        .set('Content-Type', 'application/json')
        .set('x-timestamp', timestamp)
        .set('x-signature', signature)
        .send(tampered);

      expect(res.status).toBe(400);
    });

    it('returns 400 when the timestamp is outside tolerance', async () => {
      const payload = eventPayload('payment_intent.succeeded');
      const oldTimestamp = String(Date.now() - 10 * 60 * 1000); // 10 min ago
      const { signature } = sign(payload, WEBHOOK_SECRET, oldTimestamp);

      const res = await request(app)
        .post('/webhooks/airwallex')
        .set('Content-Type', 'application/json')
        .set('x-timestamp', oldTimestamp)
        .set('x-signature', signature)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.text).toContain('Timestamp');
    });

    it('returns 200 for a valid signature', async () => {
      const payload = eventPayload('payment_intent.succeeded');
      const { timestamp, signature } = sign(payload, WEBHOOK_SECRET);

      const res = await request(app)
        .post('/webhooks/airwallex')
        .set('Content-Type', 'application/json')
        .set('x-timestamp', timestamp)
        .set('x-signature', signature)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('handles the documented event types', async () => {
      const eventTypes = [
        'payment_intent.succeeded',
        'payment_attempt.paid',
        'refund.settled',
        'refund.failed',
        'payment_consent.verified',
        'payment_dispute.requires_response',
        'some.unhandled.event',
      ];

      for (const name of eventTypes) {
        const payload = eventPayload(name);
        const { timestamp, signature } = sign(payload, WEBHOOK_SECRET);

        const res = await request(app)
          .post('/webhooks/airwallex')
          .set('Content-Type', 'application/json')
          .set('x-timestamp', timestamp)
          .set('x-signature', signature)
          .send(payload);

        expect(res.status).toBe(200);
      }
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
