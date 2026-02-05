import { describe, test, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Test webhook secret
const TEST_SECRET = 'test_woocommerce_secret_key';

// Set test environment variable
beforeAll(() => {
  process.env.WOOCOMMERCE_WEBHOOK_SECRET = TEST_SECRET;
});

/**
 * Generate a valid WooCommerce webhook signature for testing
 * @param payload - JSON payload as string
 * @param secret - Webhook secret
 * @returns Base64 encoded signature
 */
function generateTestSignature(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64');
}

// Import the handler after setting environment variables
const { POST, verifyWooCommerceWebhook } = await import('../app/webhooks/woocommerce/route');

describe('WooCommerce Webhook Handler', () => {
  describe('Signature Verification', () => {
    test('should verify valid signatures', () => {
      const payload = '{"id": 123, "status": "processing"}';
      const signature = generateTestSignature(payload, TEST_SECRET);
      
      const isValid = verifyWooCommerceWebhook(payload, signature, TEST_SECRET);
      
      expect(isValid).toBe(true);
    });
    
    test('should reject invalid signatures', () => {
      const payload = '{"id": 123, "status": "processing"}';
      const invalidSignature = 'invalid_signature';
      
      const isValid = verifyWooCommerceWebhook(payload, invalidSignature, TEST_SECRET);
      
      expect(isValid).toBe(false);
    });
    
    test('should reject missing signature', () => {
      const payload = '{"id": 123, "status": "processing"}';
      
      const isValid = verifyWooCommerceWebhook(payload, null, TEST_SECRET);
      
      expect(isValid).toBe(false);
    });
    
    test('should reject missing secret', () => {
      const payload = '{"id": 123, "status": "processing"}';
      const signature = generateTestSignature(payload, TEST_SECRET);
      
      const isValid = verifyWooCommerceWebhook(payload, signature, undefined);
      
      expect(isValid).toBe(false);
    });
    
    test('should handle different payload lengths', () => {
      const payloads = [
        '{}',
        '{"id":1}',
        '{"id": 123, "status": "processing", "total": "29.99", "customer": {"name": "John Doe"}}'
      ];
      
      payloads.forEach(payload => {
        const signature = generateTestSignature(payload, TEST_SECRET);
        const isValid = verifyWooCommerceWebhook(payload, signature, TEST_SECRET);
        expect(isValid).toBe(true);
      });
    });
  });
  
  describe('Webhook Endpoint', () => {
    test('should accept valid order.created webhook', async () => {
      const payload = {
        id: 123,
        status: 'processing',
        total: '29.99',
        currency: 'USD',
        billing: {
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@example.com'
        }
      };
      
      const payloadString = JSON.stringify(payload);
      const signature = generateTestSignature(payloadString, TEST_SECRET);
      
      const request = new Request('http://localhost:3000/webhooks/woocommerce', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-WC-Webhook-Topic': 'order.created',
          'X-WC-Webhook-Signature': signature,
          'X-WC-Webhook-Source': 'https://example.com',
        },
        body: payloadString,
      });
      
      const response = await POST(request as any);
      
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({ received: true });
    });
    
    test('should accept valid product.updated webhook', async () => {
      const payload = {
        id: 456,
        name: 'Premium T-Shirt',
        status: 'publish',
        regular_price: '29.99',
        stock_status: 'instock'
      };
      
      const payloadString = JSON.stringify(payload);
      const signature = generateTestSignature(payloadString, TEST_SECRET);
      
      const request = new Request('http://localhost:3000/webhooks/woocommerce', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-WC-Webhook-Topic': 'product.updated',
          'X-WC-Webhook-Signature': signature,
          'X-WC-Webhook-Source': 'https://example.com',
        },
        body: payloadString,
      });
      
      const response = await POST(request as any);
      
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({ received: true });
    });
    
    test('should reject webhook with invalid signature', async () => {
      const payload = {
        id: 123,
        status: 'processing'
      };
      
      const request = new Request('http://localhost:3000/webhooks/woocommerce', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-WC-Webhook-Topic': 'order.created',
          'X-WC-Webhook-Signature': 'invalid_signature',
          'X-WC-Webhook-Source': 'https://example.com',
        },
        body: JSON.stringify(payload),
      });
      
      const response = await POST(request as any);
      
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toEqual({ error: 'Invalid signature' });
    });
    
    test('should reject webhook without signature header', async () => {
      const payload = {
        id: 123,
        status: 'processing'
      };
      
      const request = new Request('http://localhost:3000/webhooks/woocommerce', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-WC-Webhook-Topic': 'order.created',
          'X-WC-Webhook-Source': 'https://example.com',
        },
        body: JSON.stringify(payload),
      });
      
      const response = await POST(request as any);
      
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toEqual({ error: 'Invalid signature' });
    });
    
    test('should handle malformed JSON gracefully', async () => {
      const invalidPayload = '{"id": 123, "status":}'; // Invalid JSON
      const signature = generateTestSignature(invalidPayload, TEST_SECRET);
      
      const request = new Request('http://localhost:3000/webhooks/woocommerce', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-WC-Webhook-Topic': 'order.created',
          'X-WC-Webhook-Signature': signature,
          'X-WC-Webhook-Source': 'https://example.com',
        },
        body: invalidPayload,
      });
      
      const response = await POST(request as any);
      
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: 'Internal server error' });
    });
  });
});