const request = require('supertest');
const crypto = require('crypto');
const { app, verifyWooCommerceWebhook } = require('../src/index');

// Test webhook secret
const TEST_SECRET = 'test_woocommerce_secret_key';

// Set test environment variable
process.env.WOOCOMMERCE_WEBHOOK_SECRET = TEST_SECRET;

/**
 * Generate a valid WooCommerce webhook signature for testing
 * @param {string} payload - JSON payload as string
 * @param {string} secret - Webhook secret
 * @returns {string} - Base64 encoded signature
 */
function generateTestSignature(payload, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64');
}

describe('WooCommerce Webhook Handler', () => {
  describe('Signature Verification', () => {
    test('should verify valid signatures', () => {
      const payload = '{"id": 123, "status": "processing"}';
      const signature = generateTestSignature(payload, TEST_SECRET);
      
      const isValid = verifyWooCommerceWebhook(
        Buffer.from(payload),
        signature,
        TEST_SECRET
      );
      
      expect(isValid).toBe(true);
    });
    
    test('should reject invalid signatures', () => {
      const payload = '{"id": 123, "status": "processing"}';
      const invalidSignature = 'invalid_signature';
      
      const isValid = verifyWooCommerceWebhook(
        Buffer.from(payload),
        invalidSignature,
        TEST_SECRET
      );
      
      expect(isValid).toBe(false);
    });
    
    test('should reject missing signature', () => {
      const payload = '{"id": 123, "status": "processing"}';
      
      const isValid = verifyWooCommerceWebhook(
        Buffer.from(payload),
        null,
        TEST_SECRET
      );
      
      expect(isValid).toBe(false);
    });
    
    test('should reject missing secret', () => {
      const payload = '{"id": 123, "status": "processing"}';
      const signature = generateTestSignature(payload, TEST_SECRET);
      
      const isValid = verifyWooCommerceWebhook(
        Buffer.from(payload),
        signature,
        null
      );
      
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
        const isValid = verifyWooCommerceWebhook(
          Buffer.from(payload),
          signature,
          TEST_SECRET
        );
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
      
      const response = await request(app)
        .post('/webhooks/woocommerce')
        .set('Content-Type', 'application/json')
        .set('X-WC-Webhook-Topic', 'order.created')
        .set('X-WC-Webhook-Signature', signature)
        .set('X-WC-Webhook-Source', 'https://example.com')
        .send(payloadString);
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
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
      
      const response = await request(app)
        .post('/webhooks/woocommerce')
        .set('Content-Type', 'application/json')
        .set('X-WC-Webhook-Topic', 'product.updated')
        .set('X-WC-Webhook-Signature', signature)
        .set('X-WC-Webhook-Source', 'https://example.com')
        .send(payloadString);
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });
    
    test('should reject webhook with invalid signature', async () => {
      const payload = {
        id: 123,
        status: 'processing'
      };
      
      const response = await request(app)
        .post('/webhooks/woocommerce')
        .set('Content-Type', 'application/json')
        .set('X-WC-Webhook-Topic', 'order.created')
        .set('X-WC-Webhook-Signature', 'invalid_signature')
        .set('X-WC-Webhook-Source', 'https://example.com')
        .send(JSON.stringify(payload));
      
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid signature' });
    });
    
    test('should reject webhook without signature header', async () => {
      const payload = {
        id: 123,
        status: 'processing'
      };
      
      const response = await request(app)
        .post('/webhooks/woocommerce')
        .set('Content-Type', 'application/json')
        .set('X-WC-Webhook-Topic', 'order.created')
        .set('X-WC-Webhook-Source', 'https://example.com')
        .send(JSON.stringify(payload));
      
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid signature' });
    });
    
    test('should handle malformed JSON gracefully', async () => {
      const invalidPayload = '{"id": 123, "status":}'; // Invalid JSON
      const signature = generateTestSignature(invalidPayload, TEST_SECRET);
      
      const response = await request(app)
        .post('/webhooks/woocommerce')
        .set('Content-Type', 'application/json')
        .set('X-WC-Webhook-Topic', 'order.created')
        .set('X-WC-Webhook-Signature', signature)
        .set('X-WC-Webhook-Source', 'https://example.com')
        .send(invalidPayload);
      
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });
  });
  
  describe('Health Check', () => {
    test('should return healthy status', async () => {
      const response = await request(app)
        .get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.timestamp).toBeDefined();
    });
  });
});