const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.SHOPIFY_API_SECRET = 'test_shopify_secret';

const { app, verifyShopifyWebhook } = require('../src/index');

/**
 * Generate a valid Shopify HMAC signature for testing
 */
function generateShopifySignature(payload, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('base64');
}

describe('Shopify Webhook Endpoint', () => {
  const apiSecret = process.env.SHOPIFY_API_SECRET;

  describe('verifyShopifyWebhook', () => {
    it('should return true for valid signature', () => {
      const payload = Buffer.from('{"id":123}');
      const signature = generateShopifySignature(payload, apiSecret);
      
      expect(verifyShopifyWebhook(payload, signature, apiSecret)).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const payload = Buffer.from('{"id":123}');
      
      expect(verifyShopifyWebhook(payload, 'invalid_signature', apiSecret)).toBe(false);
    });
  });

  describe('POST /webhooks/shopify', () => {
    it('should return 401 for missing signature', async () => {
      const response = await request(app)
        .post('/webhooks/shopify')
        .set('Content-Type', 'application/json')
        .set('X-Shopify-Topic', 'orders/create')
        .set('X-Shopify-Shop-Domain', 'test.myshopify.com')
        .send('{"id":123}');

      expect(response.status).toBe(401);
      expect(response.text).toBe('Invalid signature');
    });

    it('should return 401 for invalid signature', async () => {
      const payload = JSON.stringify({ id: 123 });

      const response = await request(app)
        .post('/webhooks/shopify')
        .set('Content-Type', 'application/json')
        .set('X-Shopify-Hmac-SHA256', 'invalid_signature')
        .set('X-Shopify-Topic', 'orders/create')
        .set('X-Shopify-Shop-Domain', 'test.myshopify.com')
        .send(payload);

      expect(response.status).toBe(401);
    });

    it('should return 200 for valid signature', async () => {
      const payload = JSON.stringify({ id: 123, email: 'test@example.com' });
      const signature = generateShopifySignature(payload, apiSecret);

      const response = await request(app)
        .post('/webhooks/shopify')
        .set('Content-Type', 'application/json')
        .set('X-Shopify-Hmac-SHA256', signature)
        .set('X-Shopify-Topic', 'orders/create')
        .set('X-Shopify-Shop-Domain', 'test.myshopify.com')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should handle different webhook topics', async () => {
      const topics = [
        'orders/create',
        'orders/updated',
        'orders/paid',
        'products/create',
        'products/update',
        'customers/create',
        'app/uninstalled',
        'customers/data_request',
        'customers/redact',
        'shop/redact'
      ];

      for (const topic of topics) {
        const payload = JSON.stringify({ id: 456 });
        const signature = generateShopifySignature(payload, apiSecret);

        const response = await request(app)
          .post('/webhooks/shopify')
          .set('Content-Type', 'application/json')
          .set('X-Shopify-Hmac-SHA256', signature)
          .set('X-Shopify-Topic', topic)
          .set('X-Shopify-Shop-Domain', 'test.myshopify.com')
          .send(payload);

        expect(response.status).toBe(200);
      }
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
