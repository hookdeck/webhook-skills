const request = require('supertest');
const crypto = require('crypto');

// Set test env vars before importing app.
process.env.GEMINI_API_KEY = 'test-gemini-key';
// Base64 of "test_secret_key_for_testing"
process.env.GEMINI_WEBHOOK_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvcl90ZXN0aW5n';

const app = require('../src/index');

/**
 * Generate a valid Standard Webhooks signature for testing.
 */
function generateStandardWebhooksSignature(payload, secret, webhookId, webhookTimestamp) {
  const secretKey = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const secretBytes = Buffer.from(secretKey, 'base64');

  const signedContent = `${webhookId}.${webhookTimestamp}.${payload}`;

  const signature = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent, 'utf8')
    .digest('base64');

  return `v1,${signature}`;
}

describe('Gemini Webhook Endpoint', () => {
  const webhookSecret = process.env.GEMINI_WEBHOOK_SECRET;

  describe('POST /webhooks/gemini', () => {
    it('should return 400 for missing signature headers', async () => {
      const response = await request(app)
        .post('/webhooks/gemini')
        .set('Content-Type', 'application/json')
        .send('{}');

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 400 for invalid signature format', async () => {
      const payload = JSON.stringify({
        type: 'batch.succeeded',
        data: { id: 'batch_123' }
      });

      const response = await request(app)
        .post('/webhooks/gemini')
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
        type: 'batch.succeeded',
        data: { id: 'batch_123' }
      });

      const webhookId = 'msg_test123';
      const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 6m40s ago
      const signature = generateStandardWebhooksSignature(
        payload,
        webhookSecret,
        webhookId,
        oldTimestamp.toString()
      );

      const response = await request(app)
        .post('/webhooks/gemini')
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
        type: 'batch.succeeded',
        data: { id: 'batch_123' }
      });

      const response = await request(app)
        .post('/webhooks/gemini')
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
        type: 'batch.succeeded',
        data: { id: 'batch_123' }
      });

      const webhookId = 'msg_test123';
      const webhookTimestamp = Math.floor(Date.now() / 1000).toString();

      const signature = generateStandardWebhooksSignature(
        originalPayload,
        webhookSecret,
        webhookId,
        webhookTimestamp
      );

      const tamperedPayload = JSON.stringify({
        type: 'batch.succeeded',
        data: { id: 'batch_TAMPERED' }
      });

      const response = await request(app)
        .post('/webhooks/gemini')
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
        type: 'batch.succeeded',
        version: 'v1',
        timestamp: '2026-05-04T12:00:00Z',
        data: {
          id: 'batch_ABC123',
          output_file_uri: 'gs://example-bucket/out.jsonl'
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
        .post('/webhooks/gemini')
        .set('Content-Type', 'application/json')
        .set('webhook-id', webhookId)
        .set('webhook-timestamp', webhookTimestamp)
        .set('webhook-signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    const eventTypes = [
      'batch.succeeded',
      'batch.failed',
      'batch.cancelled',
      'batch.expired',
      'video.generated',
      'interaction.completed',
      'interaction.requires_action',
      'interaction.failed',
      'interaction.cancelled'
    ];

    eventTypes.forEach((eventType) => {
      it(`should handle ${eventType} event`, async () => {
        const payload = JSON.stringify({
          type: eventType,
          version: 'v1',
          timestamp: '2026-05-04T12:00:00Z',
          data: { id: 'resource_123' }
        });

        const webhookId = `msg_${eventType}`;
        const webhookTimestamp = Math.floor(Date.now() / 1000).toString();
        const signature = generateStandardWebhooksSignature(
          payload,
          webhookSecret,
          webhookId,
          webhookTimestamp
        );

        const response = await request(app)
          .post('/webhooks/gemini')
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
        type: 'unknown.event.type',
        data: { test: true }
      });

      const webhookId = 'msg_unknown';
      const webhookTimestamp = Math.floor(Date.now() / 1000).toString();
      const signature = generateStandardWebhooksSignature(
        payload,
        webhookSecret,
        webhookId,
        webhookTimestamp
      );

      const response = await request(app)
        .post('/webhooks/gemini')
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
        type: 'video.generated',
        data: { id: 'video_123' }
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
        .post('/webhooks/gemini')
        .set('Content-Type', 'application/json')
        .set('Webhook-Id', webhookId)
        .set('WEBHOOK-TIMESTAMP', webhookTimestamp)
        .set('webhook-signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });
  });

  describe('GET /health', () => {
    it('should return 200 OK', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });
});
