const request = require('supertest');

// Mock environment variables before requiring the app
process.env.CHARGEBEE_WEBHOOK_USERNAME = 'test_webhook_user';
process.env.CHARGEBEE_WEBHOOK_PASSWORD = 'test_webhook_pass';
process.env.NODE_ENV = 'test';

const { app } = require('../src/index');

// Helper function to create Basic Auth header
function createBasicAuthHeader(username, password) {
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
      const response = await request(app)
        .post('/webhooks/chargebee')
        .set('Authorization', createBasicAuthHeader('test_webhook_user', 'test_webhook_pass'))
        .set('Content-Type', 'application/json')
        .send(sampleWebhookPayload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should reject webhook without Authorization header', async () => {
      const response = await request(app)
        .post('/webhooks/chargebee')
        .set('Content-Type', 'application/json')
        .send(sampleWebhookPayload);

      expect(response.status).toBe(401);
      expect(response.text).toBe('Unauthorized');
    });

    it('should reject webhook with invalid credentials', async () => {
      const response = await request(app)
        .post('/webhooks/chargebee')
        .set('Authorization', createBasicAuthHeader('wrong_user', 'wrong_pass'))
        .set('Content-Type', 'application/json')
        .send(sampleWebhookPayload);

      expect(response.status).toBe(401);
      expect(response.text).toBe('Invalid credentials');
    });

    it('should reject webhook with malformed Authorization header', async () => {
      const response = await request(app)
        .post('/webhooks/chargebee')
        .set('Authorization', 'Bearer token123')
        .set('Content-Type', 'application/json')
        .send(sampleWebhookPayload);

      expect(response.status).toBe(401);
      expect(response.text).toBe('Unauthorized');
    });

    it('should reject webhook with invalid Base64 in Authorization header', async () => {
      const response = await request(app)
        .post('/webhooks/chargebee')
        .set('Authorization', 'Basic invalid_base64!')
        .set('Content-Type', 'application/json')
        .send(sampleWebhookPayload);

      expect(response.status).toBe(401);
    });

    it('should handle password containing colons correctly', async () => {
      // Temporarily change the expected password
      const originalPassword = process.env.CHARGEBEE_WEBHOOK_PASSWORD;
      process.env.CHARGEBEE_WEBHOOK_PASSWORD = 'pass:with:colons';

      const response = await request(app)
        .post('/webhooks/chargebee')
        .set('Authorization', createBasicAuthHeader('test_webhook_user', 'pass:with:colons'))
        .set('Content-Type', 'application/json')
        .send(sampleWebhookPayload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');

      // Restore original password
      process.env.CHARGEBEE_WEBHOOK_PASSWORD = originalPassword;
    });

    it('should handle different event types', async () => {
      const eventTypes = [
        'subscription_created',
        'subscription_changed',
        'subscription_cancelled',
        'subscription_reactivated',
        'payment_succeeded',
        'payment_failed',
        'invoice_generated',
        'customer_created',
        'unknown_event_type'
      ];

      for (const eventType of eventTypes) {
        const payload = {
          ...sampleWebhookPayload,
          event_type: eventType
        };

        const response = await request(app)
          .post('/webhooks/chargebee')
          .set('Authorization', createBasicAuthHeader('test_webhook_user', 'test_webhook_pass'))
          .set('Content-Type', 'application/json')
          .send(payload);

        expect(response.status).toBe(200);
        expect(response.text).toBe('OK');
      }
    });

    it('should handle webhook with missing content gracefully', async () => {
      const payload = {
        id: 'ev_test_minimal',
        event_type: 'subscription_created',
        occurred_at: Date.now()
      };

      const response = await request(app)
        .post('/webhooks/chargebee')
        .set('Authorization', createBasicAuthHeader('test_webhook_user', 'test_webhook_pass'))
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });

    it('should reject invalid JSON payload', async () => {
      const response = await request(app)
        .post('/webhooks/chargebee')
        .set('Authorization', createBasicAuthHeader('test_webhook_user', 'test_webhook_pass'))
        .set('Content-Type', 'application/json')
        .send('invalid json');

      expect(response.status).toBe(400);
    });
  });

  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'healthy' });
    });
  });
});