import { describe, it, expect } from 'vitest';
import { POST } from '../app/webhooks/openai/route';
import { NextRequest } from 'next/server';
import { createHmac } from 'crypto';

// Base64 encoded test secret for Standard Webhooks
process.env.OPENAI_WEBHOOK_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvcl90ZXN0aW5n';

/**
 * Generate a valid Standard Webhooks signature for testing
 */
function generateStandardWebhooksSignature(
  payload: string,
  secret: string,
  webhookId: string,
  webhookTimestamp: string
): string {
  // Remove whsec_ prefix and decode base64
  const secretKey = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const secretBytes = Buffer.from(secretKey, 'base64');

  // Create signed content: id.timestamp.payload
  const signedContent = `${webhookId}.${webhookTimestamp}.${payload}`;

  // Generate HMAC signature
  const signature = createHmac('sha256', secretBytes)
    .update(signedContent, 'utf8')
    .digest('base64');

  return `v1,${signature}`;
}

/**
 * Create a NextRequest for testing
 */
function createTestRequest(
  payload: string,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/openai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: payload,
  });
}

describe('OpenAI Webhook Endpoint', () => {
  const webhookSecret = process.env.OPENAI_WEBHOOK_SECRET!;

  describe('POST /webhooks/openai', () => {
    it('should return 400 for missing signature headers', async () => {
      const request = createTestRequest('{}');
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Invalid signature');
    });

    it('should return 400 for invalid signature format', async () => {
      const payload = JSON.stringify({
        id: 'evt_test_123',
        type: 'fine_tuning.job.succeeded',
        data: { id: 'ftjob-ABC123' }
      });

      const request = createTestRequest(payload, {
        'webhook-id': 'msg_test123',
        'webhook-timestamp': Math.floor(Date.now() / 1000).toString(),
        'webhook-signature': 'invalid_format'
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Invalid signature');
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

      const request = createTestRequest(payload, {
        'webhook-id': webhookId,
        'webhook-timestamp': oldTimestamp.toString(),
        'webhook-signature': signature
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Invalid signature');
    });

    it('should return 400 for invalid signature', async () => {
      const payload = JSON.stringify({
        id: 'evt_test_123',
        type: 'fine_tuning.job.succeeded',
        data: { id: 'ftjob-ABC123' }
      });

      const request = createTestRequest(payload, {
        'webhook-id': 'msg_test123',
        'webhook-timestamp': Math.floor(Date.now() / 1000).toString(),
        'webhook-signature': 'v1,invalid_signature_value'
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Invalid signature');
    });

    it('should return 400 for tampered payload', async () => {
      const originalPayload = JSON.stringify({
        id: 'evt_test_123',
        type: 'fine_tuning.job.succeeded',
        data: { id: 'ftjob-ABC123' }
      });

      const webhookId = 'msg_test123';
      const webhookTimestamp = Math.floor(Date.now() / 1000).toString();

      // Sign with original payload
      const signature = generateStandardWebhooksSignature(
        originalPayload,
        webhookSecret,
        webhookId,
        webhookTimestamp
      );

      // But send tampered payload
      const tamperedPayload = JSON.stringify({
        id: 'evt_test_123',
        type: 'fine_tuning.job.succeeded',
        data: { id: 'ftjob-TAMPERED' }
      });

      const request = createTestRequest(tamperedPayload, {
        'webhook-id': webhookId,
        'webhook-timestamp': webhookTimestamp,
        'webhook-signature': signature
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Invalid signature');
    });

    it('should return 500 if webhook secret not configured', async () => {
      // Temporarily remove the secret
      const originalSecret = process.env.OPENAI_WEBHOOK_SECRET;
      delete process.env.OPENAI_WEBHOOK_SECRET;

      const request = createTestRequest('{}');
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toBe('Webhook secret not configured');

      // Restore the secret
      process.env.OPENAI_WEBHOOK_SECRET = originalSecret;
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

      const request = createTestRequest(payload, {
        'webhook-id': webhookId,
        'webhook-timestamp': webhookTimestamp,
        'webhook-signature': signature
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({ received: true });
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
          id: `evt_test_${eventType}`,
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

        const request = createTestRequest(payload, {
          'webhook-id': webhookId,
          'webhook-timestamp': webhookTimestamp,
          'webhook-signature': signature
        });

        const response = await POST(request);
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(json).toEqual({ received: true });
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

      const request = createTestRequest(payload, {
        'webhook-id': webhookId,
        'webhook-timestamp': webhookTimestamp,
        'webhook-signature': signature
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({ received: true });
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

      const request = createTestRequest(payload, {
        'Webhook-Id': webhookId,            // Different case
        'WEBHOOK-TIMESTAMP': webhookTimestamp, // Different case
        'webhook-signature': signature       // lowercase
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({ received: true });
    });

    it('should handle malformed JSON payload', async () => {
      const malformedPayload = '{invalid json';

      const webhookId = 'msg_test123';
      const webhookTimestamp = Math.floor(Date.now() / 1000).toString();
      const signature = generateStandardWebhooksSignature(
        malformedPayload,
        webhookSecret,
        webhookId,
        webhookTimestamp
      );

      const request = createTestRequest(malformedPayload, {
        'webhook-id': webhookId,
        'webhook-timestamp': webhookTimestamp,
        'webhook-signature': signature
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Invalid JSON payload');
    });
  });
});