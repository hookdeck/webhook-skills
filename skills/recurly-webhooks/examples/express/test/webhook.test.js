const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.RECURLY_WEBHOOK_SECRET = 'test_endpoint_secret';

const app = require('../src/index');

/**
 * Generate a valid Recurly signature header for testing.
 *
 * Mirrors Recurly's algorithm: HMAC-SHA256 over `${timestamp}.${rawBody}`,
 * hex-encoded. The header is "<timestamp>,<signature>".
 */
function generateRecurlySignature(payload, secret, timestamp = '1659641851000') {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  return `${timestamp},${signature}`;
}

describe('Recurly Webhook Endpoint', () => {
  const webhookSecret = process.env.RECURLY_WEBHOOK_SECRET;

  const newSubscriptionPayload = JSON.stringify({
    new_subscription_notification: {
      account: { account_code: '1', email: 'verena@example.com' },
      subscription: { uuid: '8435b96eb70e5640a0eaf82d0e0d6d', state: 'active' },
    },
  });

  describe('POST /webhooks/recurly', () => {
    it('should return 400 for missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/recurly')
        .set('Content-Type', 'application/json')
        .send(newSubscriptionPayload);

      expect(response.status).toBe(400);
      expect(response.text).toContain('Missing recurly-signature');
    });

    it('should return 400 for invalid signature', async () => {
      const response = await request(app)
        .post('/webhooks/recurly')
        .set('Content-Type', 'application/json')
        .set('recurly-signature', '1659641851000,deadbeef')
        .send(newSubscriptionPayload);

      expect(response.status).toBe(400);
      expect(response.text).toContain('Invalid signature');
    });

    it('should return 400 for a tampered payload', async () => {
      // Sign the original body, then send a modified one
      const signature = generateRecurlySignature(newSubscriptionPayload, webhookSecret);
      const tampered = JSON.stringify({
        new_subscription_notification: {
          account: { account_code: '1', email: 'attacker@example.com' },
          subscription: { uuid: 'tampered', state: 'active' },
        },
      });

      const response = await request(app)
        .post('/webhooks/recurly')
        .set('Content-Type', 'application/json')
        .set('recurly-signature', signature)
        .send(tampered);

      expect(response.status).toBe(400);
    });

    it('should return 200 for a valid signature', async () => {
      const signature = generateRecurlySignature(newSubscriptionPayload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/recurly')
        .set('Content-Type', 'application/json')
        .set('recurly-signature', signature)
        .send(newSubscriptionPayload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    it('should accept any one of multiple signatures (key rotation)', async () => {
      const timestamp = '1659641851000';
      const valid = crypto
        .createHmac('sha256', webhookSecret)
        .update(`${timestamp}.${newSubscriptionPayload}`)
        .digest('hex');
      // Header carries an old (expiring) signature and the current valid one
      const header = `${timestamp},0000000000000000000000000000000000000000000000000000000000000000,${valid}`;

      const response = await request(app)
        .post('/webhooks/recurly')
        .set('Content-Type', 'application/json')
        .set('recurly-signature', header)
        .send(newSubscriptionPayload);

      expect(response.status).toBe(200);
    });

    it('should handle different notification types', async () => {
      const payloads = {
        new_subscription_notification: { subscription: { uuid: 's1' } },
        updated_subscription_notification: { subscription: { uuid: 's2' } },
        canceled_subscription_notification: { subscription: { uuid: 's3' } },
        expired_subscription_notification: { subscription: { uuid: 's4' } },
        renewed_subscription_notification: { subscription: { uuid: 's5' } },
        successful_payment_notification: { transaction: { uuid: 't1' } },
        failed_payment_notification: { transaction: { uuid: 't2' } },
        unknown_notification: { foo: 'bar' },
      };

      for (const [type, inner] of Object.entries(payloads)) {
        const body = JSON.stringify({ [type]: inner });
        const signature = generateRecurlySignature(body, webhookSecret);

        const response = await request(app)
          .post('/webhooks/recurly')
          .set('Content-Type', 'application/json')
          .set('recurly-signature', signature)
          .send(body);

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
