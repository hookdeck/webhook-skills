const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.HOOKDECK_WEBHOOK_SECRET = 'test_hookdeck_secret';

const { app, verifyHookdeckSignature } = require('../src/index');

/**
 * Generate a valid Hookdeck signature for testing (base64 HMAC SHA-256)
 */
function generateHookdeckSignature(payload, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64');
}

describe('Hookdeck Event Gateway Webhook Endpoint', () => {
  const webhookSecret = process.env.HOOKDECK_WEBHOOK_SECRET;

  describe('verifyHookdeckSignature', () => {
    it('should return true for valid signature', () => {
      const payload = Buffer.from('{"type":"test"}');
      const signature = generateHookdeckSignature(payload, webhookSecret);
      
      expect(verifyHookdeckSignature(payload, signature, webhookSecret)).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const payload = Buffer.from('{"type":"test"}');
      
      expect(verifyHookdeckSignature(payload, 'invalid_signature', webhookSecret)).toBe(false);
    });

    it('should return false for missing signature', () => {
      const payload = Buffer.from('{"type":"test"}');
      
      expect(verifyHookdeckSignature(payload, null, webhookSecret)).toBe(false);
    });

    it('should return false for missing secret', () => {
      const payload = Buffer.from('{"type":"test"}');
      const signature = generateHookdeckSignature(payload, webhookSecret);
      
      expect(verifyHookdeckSignature(payload, signature, null)).toBe(false);
    });
  });

  describe('POST /webhooks', () => {
    it('should return 401 for missing signature', async () => {
      const response = await request(app)
        .post('/webhooks')
        .set('Content-Type', 'application/json')
        .set('X-Hookdeck-Event-Id', 'evt_123')
        .set('X-Hookdeck-Source-Id', 'src_123')
        .send('{"type":"test"}');

      expect(response.status).toBe(401);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 401 for invalid signature', async () => {
      const payload = JSON.stringify({ type: 'payment_intent.succeeded' });

      const response = await request(app)
        .post('/webhooks')
        .set('Content-Type', 'application/json')
        .set('X-Hookdeck-Signature', 'invalid_signature')
        .set('X-Hookdeck-Event-Id', 'evt_123')
        .set('X-Hookdeck-Source-Id', 'src_123')
        .send(payload);

      expect(response.status).toBe(401);
    });

    it('should return 200 for valid signature', async () => {
      const payload = JSON.stringify({ 
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_123' } }
      });
      const signature = generateHookdeckSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks')
        .set('Content-Type', 'application/json')
        .set('X-Hookdeck-Signature', signature)
        .set('X-Hookdeck-Event-Id', 'evt_123')
        .set('X-Hookdeck-Source-Id', 'src_123')
        .set('X-Hookdeck-Attempt-Number', '1')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ received: true, eventId: 'evt_123' });
    });

    it('should handle Stripe-style events', async () => {
      const payload = JSON.stringify({ 
        type: 'customer.subscription.created',
        data: { object: { id: 'sub_123' } }
      });
      const signature = generateHookdeckSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks')
        .set('Content-Type', 'application/json')
        .set('X-Hookdeck-Signature', signature)
        .set('X-Hookdeck-Event-Id', 'evt_456')
        .set('X-Hookdeck-Source-Id', 'src_stripe')
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should handle Shopify-style events', async () => {
      const payload = JSON.stringify({ 
        id: 123456,
        email: 'test@example.com'
      });
      const signature = generateHookdeckSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks')
        .set('Content-Type', 'application/json')
        .set('X-Hookdeck-Signature', signature)
        .set('X-Hookdeck-Event-Id', 'evt_789')
        .set('X-Hookdeck-Source-Id', 'src_shopify')
        .send(payload);

      expect(response.status).toBe(200);
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
