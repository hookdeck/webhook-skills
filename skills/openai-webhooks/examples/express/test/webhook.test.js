const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.OPENAI_API_KEY = 'sk-test-fake-key';
// Base64 encoded test secret for Standard Webhooks
process.env.OPENAI_WEBHOOK_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvcl90ZXN0aW5n';

const app = require('../src/index');

/**
 * Generate a valid Standard Webhooks signature for testing
 */
function generateStandardWebhooksSignature(payload, secret, webhookId, webhookTimestamp) {
  // Remove whsec_ prefix and decode base64
  const secretKey = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const secretBytes = Buffer.from(secretKey, 'base64');

  // Create signed content: id.timestamp.payload
  const signedContent = `${webhookId}.${webhookTimestamp}.${payload}`;

  // Generate HMAC signature
  const signature = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent, 'utf8')
    .digest('base64');

  return `v1,${signature}`;
}

describe('OpenAI Webhook Endpoint', () => {
  const webhookSecret = process.env.OPENAI_WEBHOOK_SECRET;

  describe('POST /webhooks/openai', () => {
    it('should return 400 for missing signature headers', async () => {
      const response = await request(app)
        .post('/webhooks/openai')
        .set('Content-Type', 'application/json')
        .send('{}');

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 400 for invalid signature format', async () => {
      const payload = JSON.stringify({
        id: 'evt_test_123',
        type: 'fine_tuning.job.succeeded',
        data: { id: 'ftjob-ABC123' }
      });

      const response = await request(app)
        .post('/webhooks/openai')
        .set('Content-Type', 'application/json')
        .set('webhook-id', 'msg_test123')
        .set('webhook-timestamp', Math.floor(Date.now() / 1000).toString())
        .set('webhook-signature', 'invalid_format')
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 400 for expired timestamp', async () => {
      const payload = JSON.stringify({
        id: 'evt_test_123',
        type: 'fine_tuning.job.succeeded',
        data: { id: 'ftjob-ABC123' }
      });

      const webhookId = 'msg_test123';
      const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 400 seconds ago
      const signature = generateStandardWebhooksSignature(
        payload,
        webhookSecret,
        webhookId,
        oldTimestamp.toString()
      );

      const response = await request(app)
        .post('/webhooks/openai')
        .set('Content-Type', 'application/json')
        .set('webhook-id', webhookId)
        .set('webhook-timestamp', oldTimestamp.toString())
        .set('webhook-signature', signature)
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 400 for invalid signature', async () => {
      const payload = JSON.stringify({
        id: 'evt_test_123',
        type: 'fine_tuning.job.succeeded',
        data: { id: 'ftjob-ABC123' }
      });

      const response = await request(app)
        .post('/webhooks/openai')
        .set('Content-Type', 'application/json')
        .set('webhook-id', 'msg_test123')
        .set('webhook-timestamp', Math.floor(Date.now() / 1000).toString())
        .set('webhook-signature', 'v1,invalid_signature_value')
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 400 for tampered payload', async () => {
      const originalPayload = JSON.stringify({
        id: 'evt_test_123',
        type: 'fine_tuning.job.succeeded',
        data: { id: 'ftjob-ABC123' }
      });

      const webhookId = 'msg_test123';
      const webhookTimestamp = Math.floor(Date.now() / 1000).toString();

      // Sign with original payload but send different payload
      const signature = generateStandardWebhooksSignature(
        originalPayload,
        webhookSecret,
        webhookId,
        webhookTimestamp
      );

      const tamperedPayload = JSON.stringify({
        id: 'evt_test_123',
        type: 'fine_tuning.job.succeeded',
        data: { id: 'ftjob-TAMPERED' }
      });

      const response = await request(app)
        .post('/webhooks/openai')
        .set('Content-Type', 'application/json')
        .set('webhook-id', webhookId)
        .set('webhook-timestamp', webhookTimestamp)
        .set('webhook-signature', signature)
        .send(tamperedPayload);

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 200 for valid signature', async () => {
      const payload = JSON.stringify({
        id: 'evt_test_valid',
        type: 'fine_tuning.job.succeeded',
        created_at: 1234567890,
        data: {
          id: 'ftjob-ABC123',
          fine_tuned_model: 'ft:gpt-4o-mini:my-org:custom:id'
        }
      });

      const webhookId = 'msg_test123';
      const webhookTimestamp = Math.floor(Date.now() / 1000).toString();
      const signature = generateStandardWebhooksSignature(
        payload,
        webhookSecret,
        webhookId,
        webhookTimestamp
      );

      const response = await request(app)
        .post('/webhooks/openai')
        .set('Content-Type', 'application/json')
        .set('webhook-id', webhookId)
        .set('webhook-timestamp', webhookTimestamp)
        .set('webhook-signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    const eventTypes = [
      'fine_tuning.job.succeeded',
      'fine_tuning.job.failed',
      'fine_tuning.job.cancelled',
      'batch.completed',
      'batch.failed',
      'batch.cancelled',
      'batch.expired',
      'realtime.call.incoming'
    ];

    eventTypes.forEach(eventType => {
      it(`should handle ${eventType} event`, async () => {
        const payload = JSON.stringify({
          id: 'evt_test_' + eventType,
          type: eventType,
          created_at: Date.now() / 1000,
          data: { id: 'resource_123' }
        });

        const webhookId = 'msg_test123';
        const webhookTimestamp = Math.floor(Date.now() / 1000).toString();
        const signature = generateStandardWebhooksSignature(
          payload,
          webhookSecret,
          webhookId,
          webhookTimestamp
        );

        const response = await request(app)
          .post('/webhooks/openai')
          .set('Content-Type', 'application/json')
          .set('webhook-id', webhookId)
          .set('webhook-timestamp', webhookTimestamp)
          .set('webhook-signature', signature)
          .send(payload);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ received: true });
      });
    });

    it('should handle unrecognized event type', async () => {
      const payload = JSON.stringify({
        id: 'evt_test_unknown',
        type: 'unknown.event.type',
        created_at: Date.now() / 1000,
        data: { test: true }
      });

      const webhookId = 'msg_test123';
      const webhookTimestamp = Math.floor(Date.now() / 1000).toString();
      const signature = generateStandardWebhooksSignature(
        payload,
        webhookSecret,
        webhookId,
        webhookTimestamp
      );

      const response = await request(app)
        .post('/webhooks/openai')
        .set('Content-Type', 'application/json')
        .set('webhook-id', webhookId)
        .set('webhook-timestamp', webhookTimestamp)
        .set('webhook-signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    it('should handle case-insensitive headers', async () => {
      const payload = JSON.stringify({
        id: 'evt_test_valid',
        type: 'fine_tuning.job.succeeded',
        created_at: 1234567890,
        data: { id: 'ftjob-ABC123' }
      });

      const webhookId = 'msg_test123';
      const webhookTimestamp = Math.floor(Date.now() / 1000).toString();
      const signature = generateStandardWebhooksSignature(
        payload,
        webhookSecret,
        webhookId,
        webhookTimestamp
      );

      const response = await request(app)
        .post('/webhooks/openai')
        .set('Content-Type', 'application/json')
        .set('Webhook-Id', webhookId) // Different case
        .set('WEBHOOK-TIMESTAMP', webhookTimestamp) // Different case
        .set('webhook-signature', signature) // lowercase
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });
  });

  describe('GET /health', () => {
    it('should return 200 OK', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });
});