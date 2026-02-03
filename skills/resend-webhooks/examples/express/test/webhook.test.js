const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.RESEND_API_KEY = 're_test_fake_key';
process.env.RESEND_WEBHOOK_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvcl90ZXN0aW5n';

const app = require('../src/index');

/**
 * Generate a valid Svix signature for testing (used by Resend)
 */
function generateSvixSignature(payload, secret, msgId = null, timestamp = null) {
  msgId = msgId || `msg_${crypto.randomBytes(16).toString('hex')}`;
  timestamp = timestamp || Math.floor(Date.now() / 1000).toString();
  
  // Remove 'whsec_' prefix and decode secret
  const secretKey = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const secretBytes = Buffer.from(secretKey, 'base64');
  
  // Create signed content
  const signedContent = `${msgId}.${timestamp}.${payload}`;
  
  // Compute signature
  const signature = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent)
    .digest('base64');
  
  return {
    'svix-id': msgId,
    'svix-timestamp': timestamp,
    'svix-signature': `v1,${signature}`
  };
}

describe('Resend Webhook Endpoint', () => {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

  describe('POST /webhooks/resend', () => {
    it('should return 400 for missing signature headers', async () => {
      const response = await request(app)
        .post('/webhooks/resend')
        .set('Content-Type', 'application/json')
        .send('{}');

      expect(response.status).toBe(400);
      expect(response.text).toContain('Missing webhook signature headers');
    });

    it('should return 400 for invalid signature', async () => {
      const payload = JSON.stringify({
        type: 'email.sent',
        created_at: new Date().toISOString(),
        data: { email_id: 'test_email_123' }
      });

      const response = await request(app)
        .post('/webhooks/resend')
        .set('Content-Type', 'application/json')
        .set('svix-id', 'msg_test123')
        .set('svix-timestamp', Math.floor(Date.now() / 1000).toString())
        .set('svix-signature', 'v1,invalid_signature')
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.text).toContain('Webhook Error');
    });

    it('should return 400 for tampered payload', async () => {
      const originalPayload = JSON.stringify({
        type: 'email.sent',
        created_at: new Date().toISOString(),
        data: { email_id: 'test_email_123' }
      });
      
      // Sign with original payload but send different payload
      const headers = generateSvixSignature(originalPayload, webhookSecret);
      const tamperedPayload = JSON.stringify({
        type: 'email.sent',
        created_at: new Date().toISOString(),
        data: { email_id: 'tampered_email_id' }
      });

      const response = await request(app)
        .post('/webhooks/resend')
        .set('Content-Type', 'application/json')
        .set('svix-id', headers['svix-id'])
        .set('svix-timestamp', headers['svix-timestamp'])
        .set('svix-signature', headers['svix-signature'])
        .send(tamperedPayload);

      expect(response.status).toBe(400);
    });

    it('should return 200 for valid signature', async () => {
      const payload = JSON.stringify({
        type: 'email.sent',
        created_at: new Date().toISOString(),
        data: { email_id: 'test_email_valid' }
      });
      const headers = generateSvixSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/webhooks/resend')
        .set('Content-Type', 'application/json')
        .set('svix-id', headers['svix-id'])
        .set('svix-timestamp', headers['svix-timestamp'])
        .set('svix-signature', headers['svix-signature'])
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    it('should handle different event types', async () => {
      const eventTypes = [
        'email.sent',
        'email.delivered',
        'email.delivery_delayed',
        'email.bounced',
        'email.complained',
        'email.opened',
        'email.clicked',
        'email.received',
        'unknown.event.type'
      ];

      for (const eventType of eventTypes) {
        const payload = JSON.stringify({
          type: eventType,
          created_at: new Date().toISOString(),
          data: { email_id: `test_${eventType.replace(/\./g, '_')}` }
        });
        const headers = generateSvixSignature(payload, webhookSecret);

        const response = await request(app)
          .post('/webhooks/resend')
          .set('Content-Type', 'application/json')
          .set('svix-id', headers['svix-id'])
          .set('svix-timestamp', headers['svix-timestamp'])
          .set('svix-signature', headers['svix-signature'])
          .send(payload);

        expect(response.status).toBe(200);
      }
    });

    it('should reject expired timestamps', async () => {
      const payload = JSON.stringify({
        type: 'email.sent',
        created_at: new Date().toISOString(),
        data: { email_id: 'test_expired' }
      });
      
      // Use timestamp from 10 minutes ago
      const oldTimestamp = (Math.floor(Date.now() / 1000) - 600).toString();
      const headers = generateSvixSignature(payload, webhookSecret, null, oldTimestamp);

      const response = await request(app)
        .post('/webhooks/resend')
        .set('Content-Type', 'application/json')
        .set('svix-id', headers['svix-id'])
        .set('svix-timestamp', headers['svix-timestamp'])
        .set('svix-signature', headers['svix-signature'])
        .send(payload);

      expect(response.status).toBe(400);
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
