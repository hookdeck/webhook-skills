const request = require('supertest');
const crypto = require('crypto');

// Anarlog secrets look like whsec_... but the WHOLE string is the HMAC key (not Standard Webhooks)
process.env.ANARLOG_WEBHOOK_SECRET = 'whsec_test_anarlog_secret';

const { app, verifyAnarlogWebhook } = require('../src/index');

/**
 * Generate a valid Anarlog signature for testing (sha256=<hex> of the raw body)
 */
function generateAnarlogSignature(payload, secret) {
  const digest = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `sha256=${digest}`;
}

const meetingPayload = (event) => ({
  id: 'evt_123',
  event,
  created_at: '2026-07-28T09:00:00.000Z',
  data: {
    meeting: {
      id: 'mtg_1',
      title: 'Weekly sync',
      note: {},
      summaries: [],
      participants: [],
      action_items: [{ text: 'Send follow-up' }],
    },
    transcript_text: 'Hello everyone',
  },
});

describe('Anarlog Webhook Endpoint', () => {
  const secret = process.env.ANARLOG_WEBHOOK_SECRET;

  describe('verifyAnarlogWebhook', () => {
    const payload = Buffer.from('{"event":"webhook.test"}');

    it('returns true for a valid signature', () => {
      expect(verifyAnarlogWebhook(payload, generateAnarlogSignature(payload, secret), secret)).toBe(true);
    });

    it('accepts uppercase hex', () => {
      const header = 'sha256=' + generateAnarlogSignature(payload, secret).slice(7).toUpperCase();
      expect(verifyAnarlogWebhook(payload, header, secret)).toBe(true);
    });

    it('returns false for an invalid signature', () => {
      expect(verifyAnarlogWebhook(payload, 'sha256=invalid', secret)).toBe(false);
    });

    it('returns false for missing signature', () => {
      expect(verifyAnarlogWebhook(payload, undefined, secret)).toBe(false);
    });

    it('returns false when no secret is configured', () => {
      expect(verifyAnarlogWebhook(payload, generateAnarlogSignature(payload, secret), undefined)).toBe(false);
    });

    it('requires the sha256= prefix', () => {
      const bare = generateAnarlogSignature(payload, secret).slice(7);
      expect(verifyAnarlogWebhook(payload, bare, secret)).toBe(false);
    });

    it('rejects a 64-char value that is not hex', () => {
      expect(verifyAnarlogWebhook(payload, 'sha256=' + 'z'.repeat(64), secret)).toBe(false);
    });

    it('rejects a valid signature with trailing junk', () => {
      const header = generateAnarlogSignature(payload, secret) + 'zz';
      expect(verifyAnarlogWebhook(payload, header, secret)).toBe(false);
    });

    it('uses the whole whsec_ secret as the key (not stripped or base64-decoded)', () => {
      const stripped = crypto.createHmac('sha256', secret.slice('whsec_'.length)).update(payload).digest('hex');
      expect(verifyAnarlogWebhook(payload, `sha256=${stripped}`, secret)).toBe(false);

      const decoded = crypto
        .createHmac('sha256', Buffer.from(secret.slice('whsec_'.length), 'base64'))
        .update(payload)
        .digest('hex');
      expect(verifyAnarlogWebhook(payload, `sha256=${decoded}`, secret)).toBe(false);
    });

    it('verifies the raw bytes, not re-serialized JSON', () => {
      const raw = Buffer.from('{ "event" : "webhook.test",  "id": "evt_1" }');
      expect(verifyAnarlogWebhook(raw, generateAnarlogSignature(raw, secret), secret)).toBe(true);
    });
  });

  describe('POST /webhooks/anarlog', () => {
    it('returns 401 for missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/anarlog')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(meetingPayload('meeting.completed')));

      expect(response.status).toBe(401);
      expect(response.text).toBe('Invalid signature');
    });

    it('returns 401 for invalid signature', async () => {
      const response = await request(app)
        .post('/webhooks/anarlog')
        .set('Content-Type', 'application/json')
        .set('x-anarlog-signature', 'sha256=' + '0'.repeat(64))
        .send(JSON.stringify(meetingPayload('meeting.completed')));

      expect(response.status).toBe(401);
    });

    it.each(['meeting.completed', 'note.enhanced', 'webhook.test'])('returns 200 for a valid %s', async (event) => {
      const payload = JSON.stringify(meetingPayload(event));

      const response = await request(app)
        .post('/webhooks/anarlog')
        .set('Content-Type', 'application/json')
        .set('x-anarlog-event', event)
        .set('x-anarlog-timestamp', String(Math.floor(Date.now() / 1000)))
        .set('x-anarlog-signature', generateAnarlogSignature(payload, secret))
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('returns 200 for an unhandled event type', async () => {
      const payload = JSON.stringify(meetingPayload('meeting.deleted'));

      const response = await request(app)
        .post('/webhooks/anarlog')
        .set('Content-Type', 'application/json')
        .set('x-anarlog-signature', generateAnarlogSignature(payload, secret))
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('verifies a body sent with a non-JSON content type', async () => {
      const payload = JSON.stringify(meetingPayload('webhook.test'));

      const response = await request(app)
        .post('/webhooks/anarlog')
        .set('Content-Type', 'text/plain')
        .set('x-anarlog-signature', generateAnarlogSignature(payload, secret))
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('returns 400 for a validly signed non-JSON body', async () => {
      const payload = 'not json';

      const response = await request(app)
        .post('/webhooks/anarlog')
        .set('Content-Type', 'text/plain')
        .set('x-anarlog-signature', generateAnarlogSignature(payload, secret))
        .send(payload);

      expect(response.status).toBe(400);
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
