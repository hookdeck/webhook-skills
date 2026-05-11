import { describe, it, expect } from 'vitest';
import { POST } from '../app/webhooks/gemini/route';
import { NextRequest } from 'next/server';
import { createHmac } from 'crypto';

// Base64 of "test_secret_key_for_testing"
process.env.GEMINI_WEBHOOK_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvcl90ZXN0aW5n';

function generateStandardWebhooksSignature(
  payload: string,
  secret: string,
  webhookId: string,
  webhookTimestamp: string
): string {
  const secretKey = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const secretBytes = Buffer.from(secretKey, 'base64');

  const signedContent = `${webhookId}.${webhookTimestamp}.${payload}`;

  const signature = createHmac('sha256', secretBytes)
    .update(signedContent, 'utf8')
    .digest('base64');

  return `v1,${signature}`;
}

function createTestRequest(
  payload: string,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/gemini', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: payload,
  });
}

describe('Gemini Webhook Endpoint', () => {
  const webhookSecret = process.env.GEMINI_WEBHOOK_SECRET!;

  describe('POST /webhooks/gemini', () => {
    it('should return 400 for missing signature headers', async () => {
      const request = createTestRequest('{}');
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe('Invalid signature');
    });

    it('should return 400 for invalid signature format', async () => {
      const payload = JSON.stringify({
        type: 'batch.succeeded',
        data: { id: 'batch_123' }
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
        type: 'batch.succeeded',
        data: { id: 'batch_123' }
      });

      const webhookId = 'msg_test123';
      const oldTimestamp = Math.floor(Date.now() / 1000) - 400;
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
        type: 'batch.succeeded',
        data: { id: 'batch_123' }
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
      const originalSecret = process.env.GEMINI_WEBHOOK_SECRET;
      delete process.env.GEMINI_WEBHOOK_SECRET;

      const request = createTestRequest('{}');
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toBe('Webhook secret not configured');

      process.env.GEMINI_WEBHOOK_SECRET = originalSecret;
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

      const request = createTestRequest(payload, {
        'Webhook-Id': webhookId,
        'WEBHOOK-TIMESTAMP': webhookTimestamp,
        'webhook-signature': signature
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
