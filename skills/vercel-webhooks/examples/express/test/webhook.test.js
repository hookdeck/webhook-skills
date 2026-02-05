const request = require('supertest');
const crypto = require('crypto');
const app = require('../src/index');

// Test webhook secret
const TEST_SECRET = 'test_webhook_secret_12345';

// Helper to generate valid Vercel signature
function generateVercelSignature(body, secret) {
  return crypto
    .createHmac('sha1', secret)
    .update(body)
    .digest('hex');
}

// Helper to create test event payload
function createTestEvent(type, payload = {}) {
  return {
    id: 'event_test123',
    type: type,
    createdAt: Date.now(),
    payload: payload,
    region: 'sfo1'
  };
}

describe('Vercel Webhook Handler', () => {
  // Store original env
  const originalEnv = process.env.VERCEL_WEBHOOK_SECRET;

  beforeAll(() => {
    process.env.VERCEL_WEBHOOK_SECRET = TEST_SECRET;
  });

  afterAll(() => {
    process.env.VERCEL_WEBHOOK_SECRET = originalEnv;
  });

  describe('POST /webhooks/vercel', () => {
    it('should accept valid webhook with correct signature', async () => {
      const event = createTestEvent('deployment.created', {
        deployment: {
          id: 'dpl_test123',
          name: 'test-app',
          url: 'https://test-app.vercel.app'
        },
        project: {
          id: 'prj_test123',
          name: 'test-app'
        },
        team: {
          id: 'team_test123',
          name: 'test-team'
        }
      });

      const body = JSON.stringify(event);
      const signature = generateVercelSignature(Buffer.from(body), TEST_SECRET);

      const response = await request(app)
        .post('/webhooks/vercel')
        .set('x-vercel-signature', signature)
        .set('Content-Type', 'application/json')
        .send(body);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    it('should reject webhook with missing signature', async () => {
      const event = createTestEvent('deployment.created');

      const response = await request(app)
        .post('/webhooks/vercel')
        .set('Content-Type', 'application/json')
        .send(event);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing x-vercel-signature header');
    });

    it('should reject webhook with invalid signature', async () => {
      const event = createTestEvent('deployment.created');
      const body = JSON.stringify(event);

      const response = await request(app)
        .post('/webhooks/vercel')
        .set('x-vercel-signature', 'invalid_signature_12345')
        .set('Content-Type', 'application/json')
        .send(body);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid signature');
    });

    it('should reject webhook with wrong secret', async () => {
      const event = createTestEvent('deployment.created');
      const body = JSON.stringify(event);
      // Generate signature with wrong secret
      const signature = generateVercelSignature(Buffer.from(body), 'wrong_secret');

      const response = await request(app)
        .post('/webhooks/vercel')
        .set('x-vercel-signature', signature)
        .set('Content-Type', 'application/json')
        .send(body);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid signature');
    });

    it('should handle deployment.succeeded event', async () => {
      const event = createTestEvent('deployment.succeeded', {
        deployment: {
          id: 'dpl_success123',
          name: 'test-app',
          url: 'https://test-app.vercel.app',
          duration: 45000
        }
      });

      const body = JSON.stringify(event);
      const signature = generateVercelSignature(Buffer.from(body), TEST_SECRET);

      const response = await request(app)
        .post('/webhooks/vercel')
        .set('x-vercel-signature', signature)
        .set('Content-Type', 'application/json')
        .send(body);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    it('should handle deployment.error event', async () => {
      const event = createTestEvent('deployment.error', {
        deployment: {
          id: 'dpl_error123',
          name: 'test-app',
          error: 'Build failed'
        }
      });

      const body = JSON.stringify(event);
      const signature = generateVercelSignature(Buffer.from(body), TEST_SECRET);

      const response = await request(app)
        .post('/webhooks/vercel')
        .set('x-vercel-signature', signature)
        .set('Content-Type', 'application/json')
        .send(body);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    it('should handle project.created event', async () => {
      const event = createTestEvent('project.created', {
        project: {
          id: 'prj_new123',
          name: 'new-project'
        }
      });

      const body = JSON.stringify(event);
      const signature = generateVercelSignature(Buffer.from(body), TEST_SECRET);

      const response = await request(app)
        .post('/webhooks/vercel')
        .set('x-vercel-signature', signature)
        .set('Content-Type', 'application/json')
        .send(body);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    it('should handle unknown event types gracefully', async () => {
      const event = createTestEvent('unknown.event.type', {
        custom: 'data'
      });

      const body = JSON.stringify(event);
      const signature = generateVercelSignature(Buffer.from(body), TEST_SECRET);

      const response = await request(app)
        .post('/webhooks/vercel')
        .set('x-vercel-signature', signature)
        .set('Content-Type', 'application/json')
        .send(body);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });

    it('should reject malformed JSON', async () => {
      const body = 'invalid json{';
      const signature = generateVercelSignature(Buffer.from(body), TEST_SECRET);

      const response = await request(app)
        .post('/webhooks/vercel')
        .set('x-vercel-signature', signature)
        .set('Content-Type', 'application/json')
        .send(body);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid JSON payload');
    });

    it('should handle missing webhook secret config', async () => {
      // Temporarily remove the secret
      const tempSecret = process.env.VERCEL_WEBHOOK_SECRET;
      delete process.env.VERCEL_WEBHOOK_SECRET;

      const event = createTestEvent('deployment.created');

      const response = await request(app)
        .post('/webhooks/vercel')
        .set('x-vercel-signature', 'any_signature')
        .set('Content-Type', 'application/json')
        .send(event);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Webhook secret not configured');

      // Restore secret
      process.env.VERCEL_WEBHOOK_SECRET = tempSecret;
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });
});