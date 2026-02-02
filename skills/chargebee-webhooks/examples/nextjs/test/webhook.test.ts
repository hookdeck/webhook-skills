import { describe, it, expect, beforeAll } from 'vitest';

// Mock environment variables
beforeAll(() => {
  process.env.CHARGEBEE_WEBHOOK_USERNAME = 'test_webhook_user';
  process.env.CHARGEBEE_WEBHOOK_PASSWORD = 'test_webhook_pass';
});

// Import after environment variables are set
import { POST } from '../app/webhooks/chargebee/route';
import { NextRequest } from 'next/server';

// Helper function to create Basic Auth header
function createBasicAuthHeader(username: string, password: string): string {
  const credentials = `${username}:${password}`;
  const encoded = Buffer.from(credentials).toString('base64');
  return `Basic ${encoded}`;
}

// Sample webhook payload
const sampleWebhookPayload = {
  id: 'ev_test_16BHbhF4s42tO2lK',
  occurred_at: 1704067200,
  source: 'admin_console',
  object: 'event',
  api_version: 'v2',
  event_type: 'subscription_created',
  content: {
    subscription: {
      id: '16BHbhF4s42tO2lJ',
      customer_id: '16BHbhF4s42tO2lI',
      plan_id: 'basic-monthly',
      status: 'active',
      current_term_start: 1704067200,
      current_term_end: 1706745600,
      created_at: 1704067200
    },
    customer: {
      id: '16BHbhF4s42tO2lI',
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User'
    }
  }
};

describe('Chargebee Webhook Handler', () => {
  describe('POST /webhooks/chargebee', () => {
    it('should accept webhook with valid Basic Auth credentials', async () => {
      const request = new NextRequest('http://localhost:3000/webhooks/chargebee', {
        method: 'POST',
        headers: {
          'Authorization': createBasicAuthHeader('test_webhook_user', 'test_webhook_pass'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sampleWebhookPayload),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const text = await response.text();
      expect(text).toBe('OK');
    });

    it('should reject webhook without Authorization header', async () => {
      const request = new NextRequest('http://localhost:3000/webhooks/chargebee', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sampleWebhookPayload),
      });

      const response = await POST(request);
      expect(response.status).toBe(401);

      const text = await response.text();
      expect(text).toBe('Unauthorized');
    });

    it('should reject webhook with invalid credentials', async () => {
      const request = new NextRequest('http://localhost:3000/webhooks/chargebee', {
        method: 'POST',
        headers: {
          'Authorization': createBasicAuthHeader('wrong_user', 'wrong_pass'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sampleWebhookPayload),
      });

      const response = await POST(request);
      expect(response.status).toBe(401);

      const text = await response.text();
      expect(text).toBe('Unauthorized');
    });

    it('should reject webhook with malformed Authorization header', async () => {
      const request = new NextRequest('http://localhost:3000/webhooks/chargebee', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer token123',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sampleWebhookPayload),
      });

      const response = await POST(request);
      expect(response.status).toBe(401);

      const text = await response.text();
      expect(text).toBe('Unauthorized');
    });

    it('should handle password containing colons correctly', async () => {
      // Temporarily change the expected password
      const originalPassword = process.env.CHARGEBEE_WEBHOOK_PASSWORD;
      process.env.CHARGEBEE_WEBHOOK_PASSWORD = 'pass:with:colons';

      const request = new NextRequest('http://localhost:3000/webhooks/chargebee', {
        method: 'POST',
        headers: {
          'Authorization': createBasicAuthHeader('test_webhook_user', 'pass:with:colons'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sampleWebhookPayload),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const text = await response.text();
      expect(text).toBe('OK');

      // Restore original password
      process.env.CHARGEBEE_WEBHOOK_PASSWORD = originalPassword;
    });

    it('should handle different event types', async () => {
      const eventTypes = [
        'subscription_created',
        'subscription_updated',
        'subscription_cancelled',
        'subscription_reactivated',
        'payment_initiated',
        'payment_collection_failed',
        'invoice_generated',
        'customer_created',
        'unknown_event_type'
      ];

      for (const eventType of eventTypes) {
        const payload = {
          ...sampleWebhookPayload,
          event_type: eventType
        };

        const request = new NextRequest('http://localhost:3000/webhooks/chargebee', {
          method: 'POST',
          headers: {
            'Authorization': createBasicAuthHeader('test_webhook_user', 'test_webhook_pass'),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const response = await POST(request);
        expect(response.status).toBe(200);

        const text = await response.text();
        expect(text).toBe('OK');
      }
    });

    it('should handle webhook with missing content gracefully', async () => {
      const payload = {
        id: 'ev_test_minimal',
        event_type: 'subscription_created',
        occurred_at: Date.now()
      };

      const request = new NextRequest('http://localhost:3000/webhooks/chargebee', {
        method: 'POST',
        headers: {
          'Authorization': createBasicAuthHeader('test_webhook_user', 'test_webhook_pass'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const text = await response.text();
      expect(text).toBe('OK');
    });

    it('should reject invalid JSON payload', async () => {
      const request = new NextRequest('http://localhost:3000/webhooks/chargebee', {
        method: 'POST',
        headers: {
          'Authorization': createBasicAuthHeader('test_webhook_user', 'test_webhook_pass'),
          'Content-Type': 'application/json',
        },
        body: 'invalid json',
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const text = await response.text();
      expect(text).toBe('Bad Request');
    });
  });
});