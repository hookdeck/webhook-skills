const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.PADDLE_WEBHOOK_SECRET = 'test_secret_key';

const { app, verifyPaddleSignature } = require('../src/index');

/**
 * Generate a valid Paddle signature for testing
 */
function generatePaddleSignature(payload, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}:${payload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  return `ts=${timestamp};h1=${signature}`;
}

describe('Paddle Webhook Endpoint', () => {
  const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET;

  describe('verifyPaddleSignature', () => {
    it('should return true for valid signature', () => {
      const payload = '{"event_type":"test"}';
      const signature = generatePaddleSignature(payload, webhookSecret);
      
      expect(verifyPaddleSignature(payload, signature, webhookSecret)).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const payload = '{"event_type":"test"}';
      const signature = 'ts=123;h1=invalid_signature';
      
      expect(verifyPaddleSignature(payload, signature, webhookSecret)).toBe(false);
    });

    it('should return false for missing signature header', () => {
      const payload = '{"event_type":"test"}';
      
      expect(verifyPaddleSignature(payload, null, webhookSecret)).toBe(false);
      expect(verifyPaddleSignature(payload, undefined, webhookSecret)).toBe(false);
    });

    it('should return false for malformed signature header', () => {
      const payload = '{"event_type":"test"}';
      
      expect(verifyPaddleSignature(payload, 'invalid', webhookSecret)).toBe(false);
      expect(verifyPaddleSignature(payload, 'ts=123', webhookSecret)).toBe(false);
    });
  });

  describe('POST /webhooks/paddle', () => {
    it('should return 400 for missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/paddle')
        .set('Content-Type', 'application/json')
        .send('{}');

      expect(response.status).toBe(400);
      expect(response.text).toContain('Invalid signature');
    });

    it('should return 400 for invalid signature', async () => {
      const payload = JSON.stringify({
        event_id: 'evt_test_123',
        event_type: 'subscription.created',
        data: { id: 'sub_test_123' }
      });

      const response = await request(app)
        .post('/webhooks/paddle')
        .set('Content-Type', 'application/json')
        .set('Paddle-Signature', 'ts=123;h1=invalid_signature')
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.text).toContain('Invalid signature');
    });

    it('should return 400 for tampered payload', async () => {
      const originalPayload = JSON.stringify({
        event_id: 'evt_test_123',
        event_type: 'subscription.created',
        data: { id: 'sub_test_123' }
      });
      
      // Sign with original payload but send different payload
      const signature = generatePaddleSignature(originalPayload, webhookSecret);
      const tamperedPayload = JSON.stringify({
        event_id: 'evt_test_123',
        event_type: 'subscription.created',
        data: { id: 'sub_tampered' }
      });

      const response = await request(app)
        .post('/webhooks/paddle')
        .set('Content-Type', 'application/json')
        .set('Paddle-Signature', signature)
        .send(tamperedPayload);

      expect(response.status).toBe(400);
    });

    it('should return 200 for valid signature', async () => {
      const payload = JSON.stringify({
        event_id: 'evt_test_valid',
        event_type: 'subscription.created',
        data: { id: 'sub_test_valid' }
      });
      const signature = generatePaddleSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/paddle')
        .set('Content-Type', 'application/json')
        .set('Paddle-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    it('should handle different event types', async () => {
      const eventTypes = [
        'subscription.created',
        'subscription.activated',
        'subscription.canceled',
        'subscription.paused',
        'subscription.resumed',
        'transaction.completed',
        'transaction.payment_failed',
        'unknown.event.type'
      ];

      for (const eventType of eventTypes) {
        const payload = JSON.stringify({
          event_id: `evt_${eventType.replace(/\./g, '_')}`,
          event_type: eventType,
          data: { id: 'obj_123' }
        });
        const signature = generatePaddleSignature(payload, webhookSecret);

        const response = await request(app)
          .post('/webhooks/paddle')
          .set('Content-Type', 'application/json')
          .set('Paddle-Signature', signature)
          .send(payload);

        expect(response.status).toBe(200);
      }
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
