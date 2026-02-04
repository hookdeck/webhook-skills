const request = require('supertest');
const crypto = require('crypto');

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.CURSOR_WEBHOOK_SECRET = 'test_secret_key';

const app = require('../src/index.js');

// Helper to generate valid Cursor webhook signature
function generateSignature(payload, secret) {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return `sha256=${signature}`;
}

describe('Cursor Webhook Handler', () => {
  const validPayload = {
    event: 'statusChange',
    timestamp: '2024-01-01T12:00:00.000Z',
    id: 'agent_123456',
    status: 'FINISHED',
    source: {
      repository: 'https://github.com/test/repo',
      ref: 'main'
    },
    target: {
      url: 'https://github.com/test/repo/pull/123',
      branchName: 'feature-branch',
      prUrl: 'https://github.com/test/repo/pull/123'
    },
    summary: 'Updated 3 files and fixed linting errors'
  };

  test('accepts valid webhook with correct signature', async () => {
    const payload = JSON.stringify(validPayload);
    const signature = generateSignature(payload, process.env.CURSOR_WEBHOOK_SECRET);

    const response = await request(app)
      .post('/webhooks/cursor')
      .set('Content-Type', 'application/json')
      .set('X-Webhook-Signature', signature)
      .set('X-Webhook-ID', 'msg_123456')
      .set('X-Webhook-Event', 'statusChange')
      .set('User-Agent', 'Cursor-Agent-Webhook/1.0')
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true });
  });

  test('rejects webhook with invalid signature', async () => {
    const payload = JSON.stringify(validPayload);
    const invalidSignature = 'sha256=invalid_signature';

    const response = await request(app)
      .post('/webhooks/cursor')
      .set('Content-Type', 'application/json')
      .set('X-Webhook-Signature', invalidSignature)
      .set('X-Webhook-ID', 'msg_123456')
      .set('X-Webhook-Event', 'statusChange')
      .send(payload);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid signature' });
  });

  test('rejects webhook with missing signature', async () => {
    const payload = JSON.stringify(validPayload);

    const response = await request(app)
      .post('/webhooks/cursor')
      .set('Content-Type', 'application/json')
      .set('X-Webhook-ID', 'msg_123456')
      .set('X-Webhook-Event', 'statusChange')
      .send(payload);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid signature' });
  });

  test('rejects webhook with wrong signature format', async () => {
    const payload = JSON.stringify(validPayload);
    const wrongFormatSignature = 'invalid_format_signature';

    const response = await request(app)
      .post('/webhooks/cursor')
      .set('Content-Type', 'application/json')
      .set('X-Webhook-Signature', wrongFormatSignature)
      .set('X-Webhook-ID', 'msg_123456')
      .set('X-Webhook-Event', 'statusChange')
      .send(payload);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid signature' });
  });

  test('handles ERROR status', async () => {
    const errorPayload = {
      ...validPayload,
      status: 'ERROR'
    };
    const payload = JSON.stringify(errorPayload);
    const signature = generateSignature(payload, process.env.CURSOR_WEBHOOK_SECRET);

    const response = await request(app)
      .post('/webhooks/cursor')
      .set('Content-Type', 'application/json')
      .set('X-Webhook-Signature', signature)
      .set('X-Webhook-ID', 'msg_123456')
      .set('X-Webhook-Event', 'statusChange')
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true });
  });

  test('rejects invalid JSON payload', async () => {
    const invalidJson = '{"invalid": json}';
    const signature = generateSignature(invalidJson, process.env.CURSOR_WEBHOOK_SECRET);

    const response = await request(app)
      .post('/webhooks/cursor')
      .set('Content-Type', 'application/json')
      .set('X-Webhook-Signature', signature)
      .set('X-Webhook-ID', 'msg_123456')
      .set('X-Webhook-Event', 'statusChange')
      .send(invalidJson);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid payload' });
  });

  test('health check returns ok', async () => {
    const response = await request(app)
      .get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});