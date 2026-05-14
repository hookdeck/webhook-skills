const request = require('supertest');
const crypto = require('crypto');

process.env.KNOCK_WEBHOOK_SECRET = 'test_knock_signing_secret_value';

const app = require('../src/index');

/**
 * Generate a valid x-knock-signature header for testing.
 *
 * Header format: t=<timestamp_ms>,s=<base64_signature>
 * Signed content: `${timestamp_ms}.${raw_body}`
 *
 * Knock's timestamp is in MILLISECONDS, not seconds.
 */
function generateKnockSignature(payload, secret, timestampMs = null) {
  const ts = timestampMs == null ? Date.now().toString() : String(timestampMs);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${ts}.${payload}`)
    .digest('base64');
  return `t=${ts},s=${signature}`;
}

describe('Knock webhook endpoint', () => {
  const secret = process.env.KNOCK_WEBHOOK_SECRET;

  describe('POST /webhooks/knock', () => {
    it('returns 400 when the signature header is missing', async () => {
      const res = await request(app)
        .post('/webhooks/knock')
        .set('Content-Type', 'application/json')
        .send('{}');

      expect(res.status).toBe(400);
      expect(res.text).toContain('Missing x-knock-signature header');
    });

    it('returns 400 for a malformed header', async () => {
      const res = await request(app)
        .post('/webhooks/knock')
        .set('Content-Type', 'application/json')
        .set('x-knock-signature', 'not-a-real-header')
        .send('{}');

      expect(res.status).toBe(400);
      expect(res.text).toContain('Malformed');
    });

    it('returns 400 for an invalid signature', async () => {
      const payload = JSON.stringify({
        id: 'evt_invalid',
        type: 'message.sent',
        data: { id: 'msg_1' },
      });

      const header = `t=${Date.now()},s=ZmFrZV9zaWduYXR1cmU=`;

      const res = await request(app)
        .post('/webhooks/knock')
        .set('Content-Type', 'application/json')
        .set('x-knock-signature', header)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.text).toContain('Invalid signature');
    });

    it('returns 400 for a tampered payload', async () => {
      const original = JSON.stringify({
        id: 'evt_orig',
        type: 'message.sent',
        data: { id: 'msg_orig' },
      });
      const header = generateKnockSignature(original, secret);
      const tampered = JSON.stringify({
        id: 'evt_orig',
        type: 'message.sent',
        data: { id: 'msg_TAMPERED' },
      });

      const res = await request(app)
        .post('/webhooks/knock')
        .set('Content-Type', 'application/json')
        .set('x-knock-signature', header)
        .send(tampered);

      expect(res.status).toBe(400);
      expect(res.text).toContain('Invalid signature');
    });

    it('returns 400 for an expired timestamp', async () => {
      const payload = JSON.stringify({
        id: 'evt_old',
        type: 'message.sent',
        data: { id: 'msg_old' },
      });
      // 10 minutes ago, in milliseconds
      const oldTs = Date.now() - 10 * 60 * 1000;
      const header = generateKnockSignature(payload, secret, oldTs);

      const res = await request(app)
        .post('/webhooks/knock')
        .set('Content-Type', 'application/json')
        .set('x-knock-signature', header)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.text).toContain('Timestamp outside tolerance');
    });

    it('rejects a Stripe-style seconds-based signature (regression: ms vs s)', async () => {
      // Same algorithm but timestamp in SECONDS — would pass on Stripe, must fail on Knock.
      const payload = JSON.stringify({
        id: 'evt_seconds',
        type: 'message.sent',
        data: { id: 'msg_seconds' },
      });
      const tsSeconds = Math.floor(Date.now() / 1000).toString();
      const sig = crypto
        .createHmac('sha256', secret)
        .update(`${tsSeconds}.${payload}`)
        .digest('base64');
      const header = `t=${tsSeconds},s=${sig}`;

      const res = await request(app)
        .post('/webhooks/knock')
        .set('Content-Type', 'application/json')
        .set('x-knock-signature', header)
        .send(payload);

      // Seconds-since-epoch parsed as ms-since-epoch lands in ~1970 — way outside tolerance.
      expect(res.status).toBe(400);
      expect(res.text).toContain('Timestamp outside tolerance');
    });

    it('returns 200 for a valid signature', async () => {
      const payload = JSON.stringify({
        id: 'evt_valid',
        type: 'message.delivered',
        created_at: new Date().toISOString(),
        data: { id: 'msg_valid' },
      });
      const header = generateKnockSignature(payload, secret);

      const res = await request(app)
        .post('/webhooks/knock')
        .set('Content-Type', 'application/json')
        .set('x-knock-signature', header)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('handles every documented event type', async () => {
      const eventTypes = [
        'message.sent',
        'message.delivered',
        'message.delivery_attempted',
        'message.undelivered',
        'message.bounced',
        'message.seen',
        'message.unseen',
        'message.read',
        'message.unread',
        'message.archived',
        'message.unarchived',
        'message.interacted',
        'message.link_clicked',
        'workflow.updated',
        'workflow.committed',
        'email_layout.updated',
        'email_layout.committed',
        'translation.updated',
        'translation.committed',
        'source_event_action.updated',
        'source_event_action.committed',
        'partial.updated',
        'partial.committed',
        'unknown.event.type',
      ];

      for (const type of eventTypes) {
        const payload = JSON.stringify({
          id: `evt_${type.replace(/\./g, '_')}`,
          type,
          data: { id: 'res_1', key: 'k', locale_code: 'en' },
          event_data: { url: 'https://example.com' },
        });
        const header = generateKnockSignature(payload, secret);

        const res = await request(app)
          .post('/webhooks/knock')
          .set('Content-Type', 'application/json')
          .set('x-knock-signature', header)
          .send(payload);

        expect(res.status).toBe(200);
      }
    });
  });

  describe('GET /health', () => {
    it('returns ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });
});
