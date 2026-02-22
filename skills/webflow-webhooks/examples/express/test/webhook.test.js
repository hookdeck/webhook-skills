const request = require('supertest');
const crypto = require('crypto');
const { app, verifyWebflowSignature } = require('../src/index');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.WEBFLOW_WEBHOOK_SECRET = 'test_webhook_secret_key';

describe('Webflow Webhook Handler', () => {
  const webhookSecret = process.env.WEBFLOW_WEBHOOK_SECRET;

  // Helper to generate valid signature
  function generateSignature(payload, timestamp, secret = webhookSecret) {
    const signedContent = `${timestamp}:${payload}`;
    return crypto
      .createHmac('sha256', secret)
      .update(signedContent)
      .digest('hex');
  }

  // Helper to create test webhook request
  function createWebhookRequest(payload, options = {}) {
    const timestamp = options.timestamp || Date.now().toString();
    const secret = options.secret || webhookSecret;
    const signature = options.signature || generateSignature(payload, timestamp, secret);

    return request(app)
      .post('/webhooks/webflow')
      .set('x-webflow-signature', signature)
      .set('x-webflow-timestamp', timestamp)
      .set('Content-Type', 'application/json')
      .send(payload);
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

      const response = await createWebhookRequest(payload);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
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
        }
      ];

      for (const event of eventTypes) {
        const response = await createWebhookRequest(JSON.stringify(event));
        expect(response.status).toBe(200);
      }
    });

    it('should reject webhook with invalid signature', async () => {
      const payload = JSON.stringify({
        triggerType: 'form_submission',
        payload: { test: 'data' }
      });

      const response = await createWebhookRequest(payload, {
        signature: 'invalid_signature'
      });

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('should reject webhook with missing signature header', async () => {
      const response = await request(app)
        .post('/webhooks/webflow')
        .set('x-webflow-timestamp', Date.now().toString())
        .set('Content-Type', 'application/json')
        .send('{}');

      expect(response.status).toBe(400);
      expect(response.text).toBe('Missing required headers');
    });

    it('should reject webhook with missing timestamp header', async () => {
      const response = await request(app)
        .post('/webhooks/webflow')
        .set('x-webflow-signature', 'some_signature')
        .set('Content-Type', 'application/json')
        .send('{}');

      expect(response.status).toBe(400);
      expect(response.text).toBe('Missing required headers');
    });

    it('should reject webhook with expired timestamp', async () => {
      const payload = JSON.stringify({ triggerType: 'test', payload: {} });
      const oldTimestamp = (Date.now() - 400000).toString(); // 6+ minutes old (400000 ms)

      const response = await createWebhookRequest(payload, {
        timestamp: oldTimestamp
      });

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('should accept webhook with timestamp within 5-minute window', async () => {
      const payload = JSON.stringify({ triggerType: 'test', payload: {} });
      const recentTimestamp = (Date.now() - 250000).toString(); // 4 minutes old (250000 ms)

      const response = await createWebhookRequest(payload, {
        timestamp: recentTimestamp
      });

      expect(response.status).toBe(200);
    });

    it('should reject webhook with wrong secret', async () => {
      const payload = JSON.stringify({ triggerType: 'test', payload: {} });

      const response = await createWebhookRequest(payload, {
        secret: 'wrong_secret'
      });

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid signature');
    });

    it('should handle invalid JSON gracefully', async () => {
      const invalidJson = 'not valid json';
      const timestamp = Date.now().toString();
      const signature = generateSignature(invalidJson, timestamp);

      const response = await request(app)
        .post('/webhooks/webflow')
        .set('x-webflow-signature', signature)
        .set('x-webflow-timestamp', timestamp)
        .set('Content-Type', 'application/json')
        .send(invalidJson);

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid JSON');
    });
  });

  describe('verifyWebflowSignature', () => {
    it('should verify valid signature', () => {
      const payload = 'test payload';
      const timestamp = Date.now().toString();
      const signature = generateSignature(payload, timestamp);

      const isValid = verifyWebflowSignature(
        Buffer.from(payload),
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
        Buffer.from(payload),
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
        Buffer.from(payload),
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
        Buffer.from(payload),
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
        Buffer.from(payload),
        shortSignature,
        timestamp,
        webhookSecret
      );

      expect(isValid).toBe(false);
    });
  });

  describe('GET /health', () => {
    it('should return health check', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
    });
  });
});