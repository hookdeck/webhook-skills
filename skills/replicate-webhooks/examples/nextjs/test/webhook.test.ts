import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { POST, GET } from '../app/webhooks/replicate/route';
import { NextRequest } from 'next/server';

// Test webhook secret - using realistic format
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5'; // 'whsec_' + base64('test_secret_key')

// Helper to generate valid signature
function generateSignature(payload: string, secret: string, webhookId: string, timestamp: string): string {
  const key = Buffer.from(secret.split('_')[1], 'base64');
  const signedContent = `${webhookId}.${timestamp}.${payload}`;
  return crypto
    .createHmac('sha256', key)
    .update(signedContent)
    .digest('base64');
}

// Helper to create test prediction
function createTestPrediction(status: string, overrides: any = {}) {
  const baseData = {
    id: 'test_prediction_123',
    version: '1.0.0',
    status: status,
    input: { prompt: 'test prompt' },
    output: null,
    logs: '',
    error: null,
    created_at: '2024-01-01T00:00:00.000Z',
    started_at: '2024-01-01T00:00:01.000Z',
    completed_at: null,
    urls: {
      get: 'https://api.replicate.com/v1/predictions/test_prediction_123',
      cancel: 'https://api.replicate.com/v1/predictions/test_prediction_123/cancel'
    },
    metrics: null
  };

  // Apply status-specific defaults
  if (status === 'processing') {
    baseData.logs = 'Processing image...';
  } else if (status === 'succeeded') {
    baseData.output = ['https://example.com/output.png'];
    baseData.completed_at = '2024-01-01T00:00:10.000Z';
    baseData.metrics = { predict_time: 9.5 };
  } else if (status === 'failed') {
    baseData.error = 'Model error: Out of memory';
    baseData.completed_at = '2024-01-01T00:00:10.000Z';
  }

  return { ...baseData, ...overrides };
}

// Helper to create NextRequest with webhook headers
function createWebhookRequest(payload: any, headers: Record<string, string>) {
  const body = JSON.stringify(payload);

  return new NextRequest('http://localhost:3000/webhooks/replicate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body
  });
}

describe('Replicate Webhook Handler', () => {
  beforeEach(() => {
    process.env.REPLICATE_WEBHOOK_SECRET = TEST_SECRET;
  });

  describe('GET /webhooks/replicate', () => {
    it('should return health check', async () => {
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        status: 'Replicate webhook handler running',
        endpoint: '/webhooks/replicate',
        method: 'POST'
      });
    });
  });

  describe('POST /webhooks/replicate', () => {
    it('should accept valid webhook with correct signature', async () => {
      const webhookId = 'msg_test123';
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const prediction = createTestPrediction('succeeded');
      const payload = JSON.stringify(prediction);
      const signature = generateSignature(payload, TEST_SECRET, webhookId, timestamp);

      const request = createWebhookRequest(prediction, {
        'webhook-id': webhookId,
        'webhook-timestamp': timestamp,
        'webhook-signature': `v1,${signature}`
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toMatchObject({
        received: true,
        predictionStatus: 'succeeded'
      });
    });

    it('should handle multiple signatures', async () => {
      const webhookId = 'msg_test456';
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const prediction = createTestPrediction('starting');
      const payload = JSON.stringify(prediction);
      const validSignature = generateSignature(payload, TEST_SECRET, webhookId, timestamp);
      const invalidSignature = 'invalid_signature';

      const request = createWebhookRequest(prediction, {
        'webhook-id': webhookId,
        'webhook-timestamp': timestamp,
        'webhook-signature': `v1,${invalidSignature} v1,${validSignature}`
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.received).toBe(true);
    });

    it('should handle all prediction statuses', async () => {
      const statuses = ['starting', 'processing', 'succeeded', 'failed', 'canceled'];

      for (const status of statuses) {
        const webhookId = `msg_${status}_${Date.now()}`;
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const prediction = createTestPrediction(status);
        const payload = JSON.stringify(prediction);
        const signature = generateSignature(payload, TEST_SECRET, webhookId, timestamp);

        const request = createWebhookRequest(prediction, {
          'webhook-id': webhookId,
          'webhook-timestamp': timestamp,
          'webhook-signature': `v1,${signature}`
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.predictionStatus).toBe(status);
      }
    });

    it('should reject webhook with invalid signature', async () => {
      const webhookId = 'msg_invalid';
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const prediction = createTestPrediction('succeeded');

      const request = createWebhookRequest(prediction, {
        'webhook-id': webhookId,
        'webhook-timestamp': timestamp,
        'webhook-signature': 'v1,invalid_signature'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Invalid signature' });
    });

    it('should reject webhook missing required headers', async () => {
      const prediction = createTestPrediction('succeeded');

      const request = createWebhookRequest(prediction, {});

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Missing required webhook headers' });
    });

    it('should reject webhook with expired timestamp', async () => {
      const webhookId = 'msg_expired';
      const oldTimestamp = (Math.floor(Date.now() / 1000) - 400).toString(); // 400 seconds ago
      const prediction = createTestPrediction('succeeded');
      const payload = JSON.stringify(prediction);
      const signature = generateSignature(payload, TEST_SECRET, webhookId, oldTimestamp);

      const request = createWebhookRequest(prediction, {
        'webhook-id': webhookId,
        'webhook-timestamp': oldTimestamp,
        'webhook-signature': `v1,${signature}`
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Webhook timestamp too old' });
    });

    it('should handle failed prediction event', async () => {
      const webhookId = 'msg_failed';
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const prediction = createTestPrediction('failed', {
        error: 'Model error: Out of memory',
        output: null
      });
      const payload = JSON.stringify(prediction);
      const signature = generateSignature(payload, TEST_SECRET, webhookId, timestamp);

      const request = createWebhookRequest(prediction, {
        'webhook-id': webhookId,
        'webhook-timestamp': timestamp,
        'webhook-signature': `v1,${signature}`
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.received).toBe(true);
    });

    it('should handle missing webhook secret', async () => {
      delete process.env.REPLICATE_WEBHOOK_SECRET;

      const request = createWebhookRequest({}, {
        'webhook-id': 'test',
        'webhook-timestamp': '123',
        'webhook-signature': 'test'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Webhook secret not configured' });

      // Restore for other tests
      process.env.REPLICATE_WEBHOOK_SECRET = TEST_SECRET;
    });
  });
});