const request = require('supertest');
const crypto = require('crypto');

// Set NODE_ENV to test before requiring the app
process.env.NODE_ENV = 'test';
const { app } = require('../src/index');

// Test webhook secret - using realistic format
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5'; // 'whsec_' + base64('test_secret_key')

// Create server instance for tests
let server;

// Helper to generate valid signature
function generateSignature(payload, secret, webhookId, timestamp) {
  const key = Buffer.from(secret.split('_')[1], 'base64');
  const signedContent = `${webhookId}.${timestamp}.${payload}`;
  return crypto
    .createHmac('sha256', key)
    .update(signedContent)
    .digest('base64');
}

// Helper to create test prediction
function createTestPrediction(status, overrides = {}) {
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

describe('Replicate Webhook Handler', () => {
  beforeAll((done) => {
    // Start server for tests
    const PORT = 0; // Use random available port
    server = app.listen(PORT, () => {
      done();
    });
  });

  beforeEach(() => {
    process.env.REPLICATE_WEBHOOK_SECRET = TEST_SECRET;
  });

  afterAll((done) => {
    if (server) {
      server.close(done);
    } else {
      done();
    }
  });

  describe('GET /', () => {
    it('should return health check', async () => {
      const response = await request(app).get('/');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'Replicate webhook handler running'
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

      const response = await request(app)
        .post('/webhooks/replicate')
        .set('Content-Type', 'application/json')
        .set('webhook-id', webhookId)
        .set('webhook-timestamp', timestamp)
        .set('webhook-signature', `v1,${signature}`)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
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

      const response = await request(app)
        .post('/webhooks/replicate')
        .set('Content-Type', 'application/json')
        .set('webhook-id', webhookId)
        .set('webhook-timestamp', timestamp)
        .set('webhook-signature', `v1,${invalidSignature} v1,${validSignature}`)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
    });

    it('should handle all prediction statuses', async () => {
      const statuses = ['starting', 'processing', 'succeeded', 'failed', 'canceled'];

      for (const status of statuses) {
        const webhookId = `msg_${status}_${Date.now()}`;
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const prediction = createTestPrediction(status);
        const payload = JSON.stringify(prediction);
        const signature = generateSignature(payload, TEST_SECRET, webhookId, timestamp);

        const response = await request(app)
          .post('/webhooks/replicate')
          .set('Content-Type', 'application/json')
          .set('webhook-id', webhookId)
          .set('webhook-timestamp', timestamp)
          .set('webhook-signature', `v1,${signature}`)
          .send(payload);

        expect(response.status).toBe(200);
        expect(response.body.predictionStatus).toBe(status);
      }
    });

    it('should reject webhook with invalid signature', async () => {
      const webhookId = 'msg_invalid';
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const prediction = createTestPrediction('succeeded');
      const payload = JSON.stringify(prediction);

      const response = await request(app)
        .post('/webhooks/replicate')
        .set('Content-Type', 'application/json')
        .set('webhook-id', webhookId)
        .set('webhook-timestamp', timestamp)
        .set('webhook-signature', 'v1,invalid_signature')
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid signature' });
    });

    it('should reject webhook missing required headers', async () => {
      const prediction = createTestPrediction('succeeded');
      const payload = JSON.stringify(prediction);

      const response = await request(app)
        .post('/webhooks/replicate')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Missing required webhook headers' });
    });

    it('should reject webhook with expired timestamp', async () => {
      const webhookId = 'msg_expired';
      const oldTimestamp = (Math.floor(Date.now() / 1000) - 400).toString(); // 400 seconds ago
      const prediction = createTestPrediction('succeeded');
      const payload = JSON.stringify(prediction);
      const signature = generateSignature(payload, TEST_SECRET, webhookId, oldTimestamp);

      const response = await request(app)
        .post('/webhooks/replicate')
        .set('Content-Type', 'application/json')
        .set('webhook-id', webhookId)
        .set('webhook-timestamp', oldTimestamp)
        .set('webhook-signature', `v1,${signature}`)
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Webhook timestamp too old' });
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

      const response = await request(app)
        .post('/webhooks/replicate')
        .set('Content-Type', 'application/json')
        .set('webhook-id', webhookId)
        .set('webhook-timestamp', timestamp)
        .set('webhook-signature', `v1,${signature}`)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
    });

    it('should process webhook with various content types', async () => {
      // This test verifies proper handling of webhook content
      const webhookId = 'msg_content';
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const prediction = createTestPrediction('processing');
      const payload = JSON.stringify(prediction);
      const signature = generateSignature(payload, TEST_SECRET, webhookId, timestamp);

      const response = await request(app)
        .post('/webhooks/replicate')
        .set('Content-Type', 'application/json')
        .set('webhook-id', webhookId)
        .set('webhook-timestamp', timestamp)
        .set('webhook-signature', `v1,${signature}`)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.predictionStatus).toBe('processing');
    });

    it('should handle missing webhook secret', async () => {
      delete process.env.REPLICATE_WEBHOOK_SECRET;

      const response = await request(app)
        .post('/webhooks/replicate')
        .set('Content-Type', 'application/json')
        .set('webhook-id', 'test')
        .set('webhook-timestamp', '123')
        .set('webhook-signature', 'test')
        .send('{}');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Webhook secret not configured' });

      // Restore for other tests
      process.env.REPLICATE_WEBHOOK_SECRET = TEST_SECRET;
    });
  });
});