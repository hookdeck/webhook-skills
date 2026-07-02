const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.RAZORPAY_WEBHOOK_SECRET = 'test_razorpay_secret';

const { app, verifyRazorpayWebhook } = require('../src/index');

/**
 * Generate a valid Razorpay signature for testing.
 * Matches Razorpay's scheme: HMAC-SHA256 (hex) over the raw body.
 */
function generateRazorpaySignature(payload, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

describe('Razorpay Webhook Endpoint', () => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  describe('verifyRazorpayWebhook', () => {
    it('should return true for a valid signature', () => {
      const payload = Buffer.from('{"event":"payment.captured"}');
      const signature = generateRazorpaySignature(payload, webhookSecret);

      expect(verifyRazorpayWebhook(payload, signature, webhookSecret)).toBe(true);
    });

    it('should return false for an invalid signature', () => {
      const payload = Buffer.from('{"event":"payment.captured"}');

      expect(verifyRazorpayWebhook(payload, 'deadbeef', webhookSecret)).toBe(false);
    });

    it('should return false for a missing signature', () => {
      const payload = Buffer.from('{"event":"payment.captured"}');

      expect(verifyRazorpayWebhook(payload, undefined, webhookSecret)).toBe(false);
    });

    it('should return false for a tampered payload', () => {
      const original = Buffer.from('{"event":"payment.captured","amount":100}');
      const signature = generateRazorpaySignature(original, webhookSecret);
      const tampered = Buffer.from('{"event":"payment.captured","amount":999}');

      expect(verifyRazorpayWebhook(tampered, signature, webhookSecret)).toBe(false);
    });

    it('should return false for the wrong secret', () => {
      const payload = Buffer.from('{"event":"payment.captured"}');
      const signature = generateRazorpaySignature(payload, webhookSecret);

      expect(verifyRazorpayWebhook(payload, signature, 'wrong_secret')).toBe(false);
    });
  });

  describe('POST /webhooks/razorpay', () => {
    function buildEvent(event, entities) {
      return JSON.stringify({
        entity: 'event',
        account_id: 'acc_test',
        event,
        contains: Object.keys(entities),
        payload: entities,
        created_at: 1590597321,
      });
    }

    it('should return 400 for a missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/razorpay')
        .set('Content-Type', 'application/json')
        .send(buildEvent('payment.captured', { payment: { entity: { id: 'pay_1' } } }));

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 400 for an invalid signature', async () => {
      const payload = buildEvent('payment.captured', { payment: { entity: { id: 'pay_1' } } });

      const response = await request(app)
        .post('/webhooks/razorpay')
        .set('Content-Type', 'application/json')
        .set('X-Razorpay-Signature', 'deadbeef')
        .send(payload);

      expect(response.status).toBe(400);
    });

    it('should return 200 for a valid payment.captured event', async () => {
      const payload = buildEvent('payment.captured', {
        payment: { entity: { id: 'pay_1', amount: 5000, currency: 'INR' } },
      });
      const signature = generateRazorpaySignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/razorpay')
        .set('Content-Type', 'application/json')
        .set('X-Razorpay-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should handle a payment.failed event', async () => {
      const payload = buildEvent('payment.failed', {
        payment: { entity: { id: 'pay_2', error_description: 'card declined' } },
      });
      const signature = generateRazorpaySignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/razorpay')
        .set('Content-Type', 'application/json')
        .set('X-Razorpay-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should handle an order.paid event', async () => {
      const payload = buildEvent('order.paid', {
        order: { entity: { id: 'order_1', amount_paid: 5000 } },
        payment: { entity: { id: 'pay_3' } },
      });
      const signature = generateRazorpaySignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/razorpay')
        .set('Content-Type', 'application/json')
        .set('X-Razorpay-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should handle a refund.processed event', async () => {
      const payload = buildEvent('refund.processed', {
        refund: { entity: { id: 'rfnd_1', payment_id: 'pay_1' } },
        payment: { entity: { id: 'pay_1' } },
      });
      const signature = generateRazorpaySignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/razorpay')
        .set('Content-Type', 'application/json')
        .set('X-Razorpay-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
    });

    it('should handle a subscription.charged event', async () => {
      const payload = buildEvent('subscription.charged', {
        subscription: { entity: { id: 'sub_1' } },
        payment: { entity: { id: 'pay_4' } },
      });
      const signature = generateRazorpaySignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/razorpay')
        .set('Content-Type', 'application/json')
        .set('X-Razorpay-Signature', signature)
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
