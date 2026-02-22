import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { POST, verifyWebflowSignature } from '../app/webhooks/webflow/route';

// Mock environment variables
vi.stubEnv('WEBFLOW_WEBHOOK_SECRET', 'test_webhook_secret_key');

describe('Webflow Webhook Handler', () => {
  const webhookSecret = 'test_webhook_secret_key';

  // Helper to generate valid signature
  function generateSignature(payload: string, timestamp: string, secret = webhookSecret): string {
    const signedContent = `${timestamp}:${payload}`;
    return crypto
      .createHmac('sha256', secret)
      .update(signedContent)
      .digest('hex');
  }

  // Helper to create test webhook request
  function createWebhookRequest(
    payload: string,
    options: {
      timestamp?: string;
      signature?: string;
      secret?: string;
      headers?: Record<string, string>;
    } = {}
  ): NextRequest {
    const timestamp = options.timestamp || Date.now().toString();
    const signature = options.signature || generateSignature(payload, timestamp, options.secret);

    const headers = new Headers({
      'x-webflow-signature': signature,
      'x-webflow-timestamp': timestamp,
      'content-type': 'application/json',
      ...options.headers,
    });

    return new NextRequest('http://localhost:3000/webhooks/webflow', {
      method: 'POST',
      headers,
      body: payload,
    });
  }

  describe('POST /webhooks/webflow', () => {
    it('should accept valid webhook with correct signature', async () => {
      const payload = JSON.stringify({
        triggerType: 'form_submission',
        payload: {
          name: 'Contact Form',
          siteId: '123456',
          data: {
            email: 'test@example.com',
            message: 'Test message'
          },
          submittedAt: '2024-01-15T12:00:00.000Z',
          id: 'form123'
        }
      });

      const request = createWebhookRequest(payload);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ received: true });
    });

    it('should handle different event types', async () => {
      const eventTypes = [
        {
          triggerType: 'ecomm_new_order',
          payload: {
            orderId: 'order123',
            total: 99.99,
            currency: 'USD'
          }
        },
        {
          triggerType: 'collection_item_created',
          payload: {
            _id: 'item123',
            name: 'New Item',
            _cid: 'collection123'
          }
        },
        {
          triggerType: 'site_publish',
          payload: {}
        },
        {
          triggerType: 'user_account_added',
          payload: {
            userId: 'user123'
          }
        }
      ];

      for (const event of eventTypes) {
        const request = createWebhookRequest(JSON.stringify(event));
        const response = await POST(request);
        expect(response.status).toBe(200);
      }
    });

    it('should reject webhook with invalid signature', async () => {
      const payload = JSON.stringify({
        triggerType: 'form_submission',
        payload: { test: 'data' }
      });

      const request = createWebhookRequest(payload, {
        signature: 'invalid_signature'
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid signature');
    });

    it('should reject webhook with missing signature header', async () => {
      const headers = new Headers({
        'x-webflow-timestamp': Date.now().toString(),
        'content-type': 'application/json',
      });

      const request = new NextRequest('http://localhost:3000/webhooks/webflow', {
        method: 'POST',
        headers,
        body: '{}',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing required headers');
    });

    it('should reject webhook with missing timestamp header', async () => {
      const headers = new Headers({
        'x-webflow-signature': 'some_signature',
        'content-type': 'application/json',
      });

      const request = new NextRequest('http://localhost:3000/webhooks/webflow', {
        method: 'POST',
        headers,
        body: '{}',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing required headers');
    });

    it('should reject webhook with expired timestamp', async () => {
      const payload = JSON.stringify({ triggerType: 'test', payload: {} });
      const oldTimestamp = (Date.now() - 400000).toString(); // 6+ minutes old (400000 ms)

      const request = createWebhookRequest(payload, {
        timestamp: oldTimestamp
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid signature');
    });

    it('should accept webhook with timestamp within 5-minute window', async () => {
      const payload = JSON.stringify({ triggerType: 'test', payload: {} });
      const recentTimestamp = (Date.now() - 250000).toString(); // 4 minutes old (250000 ms)

      const request = createWebhookRequest(payload, {
        timestamp: recentTimestamp
      });
      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it('should reject webhook with wrong secret', async () => {
      const payload = JSON.stringify({ triggerType: 'test', payload: {} });

      const request = createWebhookRequest(payload, {
        secret: 'wrong_secret'
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid signature');
    });

    it('should handle invalid JSON gracefully', async () => {
      const invalidJson = 'not valid json';
      const timestamp = Date.now().toString();
      const signature = generateSignature(invalidJson, timestamp);

      const headers = new Headers({
        'x-webflow-signature': signature,
        'x-webflow-timestamp': timestamp,
        'content-type': 'application/json',
      });

      const request = new NextRequest('http://localhost:3000/webhooks/webflow', {
        method: 'POST',
        headers,
        body: invalidJson,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid JSON');
    });

    it('should return 500 when webhook secret is not configured', async () => {
      // Temporarily clear the secret
      vi.stubEnv('WEBFLOW_WEBHOOK_SECRET', '');

      const payload = JSON.stringify({ triggerType: 'test', payload: {} });
      const request = createWebhookRequest(payload);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Webhook secret not configured');

      // Restore the secret
      vi.stubEnv('WEBFLOW_WEBHOOK_SECRET', webhookSecret);
    });
  });

  describe('verifyWebflowSignature', () => {
    it('should verify valid signature', () => {
      const payload = 'test payload';
      const timestamp = Date.now().toString();
      const signature = generateSignature(payload, timestamp);

      const isValid = verifyWebflowSignature(
        payload,
        signature,
        timestamp,
        webhookSecret
      );

      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', () => {
      const payload = 'test payload';
      const timestamp = Date.now().toString();

      const isValid = verifyWebflowSignature(
        payload,
        'invalid_signature',
        timestamp,
        webhookSecret
      );

      expect(isValid).toBe(false);
    });

    it('should reject expired timestamp', () => {
      const payload = 'test payload';
      const oldTimestamp = (Date.now() - 400000).toString();
      const signature = generateSignature(payload, oldTimestamp);

      const isValid = verifyWebflowSignature(
        payload,
        signature,
        oldTimestamp,
        webhookSecret
      );

      expect(isValid).toBe(false);
    });

    it('should handle invalid timestamp format', () => {
      const payload = 'test payload';
      const signature = generateSignature(payload, 'not-a-number');

      const isValid = verifyWebflowSignature(
        payload,
        signature,
        'not-a-number',
        webhookSecret
      );

      expect(isValid).toBe(false);
    });

    it('should handle signatures of different lengths', () => {
      const payload = 'test payload';
      const timestamp = Date.now().toString();
      const validSignature = generateSignature(payload, timestamp);
      const shortSignature = validSignature.substring(0, 10);

      const isValid = verifyWebflowSignature(
        payload,
        shortSignature,
        timestamp,
        webhookSecret
      );

      expect(isValid).toBe(false);
    });
  });
});