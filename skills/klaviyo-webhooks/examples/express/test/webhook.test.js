const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.KLAVIYO_WEBHOOK_SECRET = 'test_klaviyo_secret_key_1234';

const { app, verifyKlaviyoWebhook } = require('../src/index');

/**
 * Generate a valid Klaviyo signature for testing.
 * Matches Klaviyo's scheme: HMAC-SHA256(secret, rawBody + timestamp), hex.
 */
function generateKlaviyoSignature(payload, timestamp, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .update(timestamp)
    .digest('hex');
}

function samplePayload(topic = 'event:klaviyo.opened_email') {
  return JSON.stringify({
    data: [{ external_id: 'evt_123', topic, payload: { foo: 'bar' } }],
    meta: { klaviyo_webhook_id: 'whk_1', timestamp: '2026-07-02T12:00:00+00:00' },
  });
}

describe('Klaviyo Webhook Endpoint', () => {
  const secret = process.env.KLAVIYO_WEBHOOK_SECRET;
  const timestamp = '1751457600';

  describe('verifyKlaviyoWebhook', () => {
    it('returns true for a valid signature', () => {
      const payload = Buffer.from(samplePayload());
      const signature = generateKlaviyoSignature(payload, timestamp, secret);

      expect(verifyKlaviyoWebhook(payload, timestamp, signature, secret)).toBe(true);
    });

    it('returns false for an invalid signature', () => {
      const payload = Buffer.from(samplePayload());

      expect(verifyKlaviyoWebhook(payload, timestamp, 'deadbeef', secret)).toBe(false);
    });

    it('returns false when the timestamp is tampered', () => {
      const payload = Buffer.from(samplePayload());
      const signature = generateKlaviyoSignature(payload, timestamp, secret);

      expect(verifyKlaviyoWebhook(payload, '9999999999', signature, secret)).toBe(false);
    });

    it('returns false for the wrong secret', () => {
      const payload = Buffer.from(samplePayload());
      const signature = generateKlaviyoSignature(payload, timestamp, secret);

      expect(verifyKlaviyoWebhook(payload, timestamp, signature, 'wrong_secret')).toBe(false);
    });
  });

  describe('POST /webhooks/klaviyo', () => {
    it('returns 400 when signature headers are missing', async () => {
      const response = await request(app)
        .post('/webhooks/klaviyo')
        .set('Content-Type', 'application/json')
        .send(samplePayload());

      expect(response.status).toBe(400);
      expect(response.text).toBe('Missing signature headers');
    });

    it('returns 400 for an invalid signature', async () => {
      const payload = samplePayload();

      const response = await request(app)
        .post('/webhooks/klaviyo')
        .set('Content-Type', 'application/json')
        .set('Klaviyo-Signature', 'invalid')
        .set('Klaviyo-Timestamp', timestamp)
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('returns 200 for a valid signature', async () => {
      const payload = samplePayload();
      const signature = generateKlaviyoSignature(Buffer.from(payload), timestamp, secret);

      const response = await request(app)
        .post('/webhooks/klaviyo')
        .set('Content-Type', 'application/json')
        .set('Klaviyo-Signature', signature)
        .set('Klaviyo-Timestamp', timestamp)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('handles different event topics', async () => {
      const topics = [
        'event:klaviyo.opened_email',
        'event:klaviyo.clicked_email',
        'event:klaviyo.bounced_email',
        'event:klaviyo.marked_email_as_spam',
        'event:klaviyo.unsubscribed_from_email_marketing',
        'event:klaviyo.sent_sms',
        'event:klaviyo.received_sms',
        'event:klaviyo.submitted_review',
      ];

      for (const topic of topics) {
        const payload = samplePayload(topic);
        const signature = generateKlaviyoSignature(Buffer.from(payload), timestamp, secret);

        const response = await request(app)
          .post('/webhooks/klaviyo')
          .set('Content-Type', 'application/json')
          .set('Klaviyo-Signature', signature)
          .set('Klaviyo-Timestamp', timestamp)
          .send(payload);

        expect(response.status).toBe(200);
      }
    });

    it('processes a batch of multiple events', async () => {
      const payload = JSON.stringify({
        data: [
          { external_id: 'e1', topic: 'event:klaviyo.opened_email', payload: {} },
          { external_id: 'e2', topic: 'event:klaviyo.clicked_email', payload: {} },
        ],
        meta: { klaviyo_webhook_id: 'whk_1' },
      });
      const signature = generateKlaviyoSignature(Buffer.from(payload), timestamp, secret);

      const response = await request(app)
        .post('/webhooks/klaviyo')
        .set('Content-Type', 'application/json')
        .set('Klaviyo-Signature', signature)
        .set('Klaviyo-Timestamp', timestamp)
        .send(payload);

      expect(response.status).toBe(200);
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
