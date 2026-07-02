const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.WORKOS_API_KEY = 'sk_test_fake_key';
process.env.WORKOS_WEBHOOK_SECRET = 'wh_test_secret';

const app = require('../src/index');

/**
 * Generate a valid WorkOS signature for testing.
 * Format: "t=<ms timestamp>, v1=<hex HMAC-SHA256 of `${t}.${payload}`>"
 * Note: the timestamp is in MILLISECONDS (unlike Stripe's seconds).
 */
function generateWorkOSSignature(payload, secret, timestamp = Date.now()) {
  const signedPayload = `${timestamp}.${payload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  return `t=${timestamp}, v1=${signature}`;
}

describe('WorkOS Webhook Endpoint', () => {
  const webhookSecret = process.env.WORKOS_WEBHOOK_SECRET;

  describe('POST /webhooks/workos', () => {
    it('should return 400 for missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/workos')
        .set('Content-Type', 'application/json')
        .send('{}');

      expect(response.status).toBe(400);
    });

    it('should return 400 for invalid signature', async () => {
      const payload = JSON.stringify({
        id: 'event_test_123',
        event: 'dsync.user.created',
        data: { id: 'directory_user_123' },
      });

      const response = await request(app)
        .post('/webhooks/workos')
        .set('Content-Type', 'application/json')
        .set('WorkOS-Signature', `t=${Date.now()}, v1=invalidsignature`)
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.text).toContain('Webhook Error');
    });

    it('should return 400 for tampered payload', async () => {
      const originalPayload = JSON.stringify({
        id: 'event_test_123',
        event: 'dsync.user.created',
        data: { id: 'directory_user_123' },
      });
      // Sign the original payload but send a different one
      const signature = generateWorkOSSignature(originalPayload, webhookSecret);
      const tamperedPayload = JSON.stringify({
        id: 'event_test_123',
        event: 'dsync.user.created',
        data: { id: 'directory_user_tampered' },
      });

      const response = await request(app)
        .post('/webhooks/workos')
        .set('Content-Type', 'application/json')
        .set('WorkOS-Signature', signature)
        .send(tamperedPayload);

      expect(response.status).toBe(400);
    });

    it('should return 400 for a stale timestamp (replay)', async () => {
      const payload = JSON.stringify({
        id: 'event_test_123',
        event: 'dsync.user.created',
        data: { id: 'directory_user_123' },
      });
      // 5 minutes ago — outside the 3 minute default tolerance
      const staleTimestamp = Date.now() - 5 * 60 * 1000;
      const signature = generateWorkOSSignature(payload, webhookSecret, staleTimestamp);

      const response = await request(app)
        .post('/webhooks/workos')
        .set('Content-Type', 'application/json')
        .set('WorkOS-Signature', signature)
        .send(payload);

      expect(response.status).toBe(400);
    });

    it('should return 200 for valid signature', async () => {
      const payload = JSON.stringify({
        id: 'event_test_valid',
        event: 'dsync.user.created',
        data: { id: 'directory_user_valid' },
      });
      const signature = generateWorkOSSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/workos')
        .set('Content-Type', 'application/json')
        .set('WorkOS-Signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    it('should handle different event types', async () => {
      // Data shapes match what the WorkOS SDK expects to deserialize per event.
      const events = [
        { event: 'dsync.user.created', data: { object: 'directory_user', id: 'directory_user_1' } },
        {
          event: 'dsync.group.user_added',
          data: {
            directory_id: 'directory_1',
            user: { object: 'directory_user', id: 'directory_user_1' },
            group: { object: 'directory_group', id: 'directory_group_1' },
          },
        },
        { event: 'connection.activated', data: { object: 'connection', id: 'conn_1' } },
        { event: 'user.created', data: { object: 'user', id: 'user_1' } },
        { event: 'session.created', data: { object: 'session', id: 'session_1' } },
        { event: 'unknown.event.type', data: { id: 'obj_123' } },
      ];

      for (const { event: eventType, data } of events) {
        const payload = JSON.stringify({
          id: `event_${eventType.replace(/\./g, '_')}`,
          event: eventType,
          data,
        });
        const signature = generateWorkOSSignature(payload, webhookSecret);

        const response = await request(app)
          .post('/webhooks/workos')
          .set('Content-Type', 'application/json')
          .set('WorkOS-Signature', signature)
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
