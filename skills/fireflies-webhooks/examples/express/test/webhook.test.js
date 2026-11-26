const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.FIREFLIES_WEBHOOK_SECRET = 'test_fireflies_secret_1234';

const { app, verifyFirefliesWebhook } = require('../src/index');

/**
 * Generate a valid Fireflies Webhooks V2 signature for testing.
 * HMAC-SHA256 over the raw body, hex-encoded, with the `sha256=` prefix.
 */
function generateFirefliesSignature(payload, secret) {
  const hex = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return `sha256=${hex}`;
}

describe('Fireflies Webhook Endpoint (V2)', () => {
  const webhookSecret = process.env.FIREFLIES_WEBHOOK_SECRET;

  describe('verifyFirefliesWebhook', () => {
    it('should return true for valid signature', () => {
      const payload = Buffer.from('{"event":"meeting.transcribed","meeting_id":"abc"}');
      const signature = generateFirefliesSignature(payload, webhookSecret);

      expect(verifyFirefliesWebhook(payload, signature, webhookSecret)).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const payload = Buffer.from('{"meeting_id":"abc"}');

      expect(verifyFirefliesWebhook(payload, 'sha256=deadbeef', webhookSecret)).toBe(false);
    });

    it('should return false for missing signature', () => {
      const payload = Buffer.from('{"meeting_id":"abc"}');

      expect(verifyFirefliesWebhook(payload, null, webhookSecret)).toBe(false);
    });

    it('should return false for wrong secret', () => {
      const payload = Buffer.from('{"meeting_id":"abc"}');
      const signature = generateFirefliesSignature(payload, webhookSecret);

      expect(verifyFirefliesWebhook(payload, signature, 'wrong_secret')).toBe(false);
    });

    it('should return false for tampered payload', () => {
      const original = Buffer.from('{"meeting_id":"abc"}');
      const signature = generateFirefliesSignature(original, webhookSecret);
      const tampered = Buffer.from('{"meeting_id":"xyz"}');

      expect(verifyFirefliesWebhook(tampered, signature, webhookSecret)).toBe(false);
    });

    it('should return false for a bare hex digest with no sha256= prefix', () => {
      const payload = Buffer.from('{"meeting_id":"abc"}');
      const bareHex = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');

      expect(verifyFirefliesWebhook(payload, bareHex, webhookSecret)).toBe(false);
    });

    it('should return false for a malformed prefix', () => {
      const payload = Buffer.from('{"meeting_id":"abc"}');
      const hex = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');

      expect(verifyFirefliesWebhook(payload, `sha1=${hex}`, webhookSecret)).toBe(false);
      expect(verifyFirefliesWebhook(payload, `sha256:${hex}`, webhookSecret)).toBe(false);
    });
  });

  describe('POST /webhooks/fireflies', () => {
    it('should return 401 for missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/fireflies')
        .set('Content-Type', 'application/json')
        .send('{"event":"meeting.transcribed","meeting_id":"abc"}');

      expect(response.status).toBe(401);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 401 for invalid signature', async () => {
      const payload = JSON.stringify({ event: 'meeting.transcribed', meeting_id: 'abc' });

      const response = await request(app)
        .post('/webhooks/fireflies')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature', 'sha256=deadbeef')
        .send(payload);

      expect(response.status).toBe(401);
    });

    it('should return 401 for a tampered body', async () => {
      const original = JSON.stringify({ event: 'meeting.transcribed', meeting_id: 'abc' });
      const signature = generateFirefliesSignature(original, webhookSecret);
      const tampered = JSON.stringify({ event: 'meeting.transcribed', meeting_id: 'xyz' });

      const response = await request(app)
        .post('/webhooks/fireflies')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature', signature)
        .send(tampered);

      expect(response.status).toBe(401);
    });

    it('should return 401 when the prefix is missing', async () => {
      const payload = JSON.stringify({ event: 'meeting.transcribed', meeting_id: 'abc' });
      const bareHex = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');

      const response = await request(app)
        .post('/webhooks/fireflies')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature', bareHex)
        .send(payload);

      expect(response.status).toBe(401);
    });

    it('should return 200 for valid signature', async () => {
      const payload = JSON.stringify({
        event: 'meeting.transcribed',
        timestamp: 1710876543210,
        meeting_id: 'ASxwZxCstx'
      });
      const signature = generateFirefliesSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/fireflies')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should handle meeting.transcribed with client_reference_id', async () => {
      const payload = JSON.stringify({
        event: 'meeting.transcribed',
        timestamp: 1710876543210,
        meeting_id: 'ASxwZxCstx',
        client_reference_id: 'be582c46-4ac9-4565-9ba6-6ab4264496a8'
      });
      const signature = generateFirefliesSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/fireflies')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
    });

    it.each([
      'meeting.transcribed',
      'meeting.summarized',
      'meeting.bot_joined'
    ])('should dispatch the %s event', async (event) => {
      const payload = JSON.stringify({
        event,
        timestamp: 1710876543210,
        meeting_id: 'ASxwZxCstx'
      });
      const signature = generateFirefliesSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/fireflies')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should acknowledge unknown event types with 200', async () => {
      const payload = JSON.stringify({
        event: 'meeting.some_future_event',
        timestamp: 1710876543210,
        meeting_id: 'ASxwZxCstx'
      });
      const signature = generateFirefliesSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/fireflies')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
    });
  });

  describe('POST /webhooks/fireflies with no signing secret configured', () => {
    // Fireflies omits X-Hub-Signature entirely when no signing secret is set at
    // webhook setup. This example accepts those deliveries with a warning.
    beforeEach(() => {
      delete process.env.FIREFLIES_WEBHOOK_SECRET;
    });

    afterEach(() => {
      process.env.FIREFLIES_WEBHOOK_SECRET = webhookSecret;
    });

    it('should accept an unsigned delivery and warn', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const payload = JSON.stringify({
        event: 'meeting.transcribed',
        timestamp: 1710876543210,
        meeting_id: 'ASxwZxCstx'
      });

      const response = await request(app)
        .post('/webhooks/fireflies')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(200);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('UNVERIFIED'));

      warn.mockRestore();
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });
});
