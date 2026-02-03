const request = require('supertest');
const crypto = require('crypto');
const { app, server } = require('../src/index');

// Test webhook secret (base64 encoded)
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Helper to generate valid Clerk/Svix signatures
function generateClerkSignature(payload, secret, timestamp, msgId) {
  const signedContent = `${msgId}.${timestamp}.${payload}`;
  const secretBytes = Buffer.from(secret.split('_')[1], 'base64');
  const signature = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent)
    .digest('base64');
  return `v1,${signature}`;
}

describe('Clerk Webhook Handler', () => {
  beforeAll(() => {
    process.env.CLERK_WEBHOOK_SECRET = TEST_SECRET;
  });

  afterAll(async () => {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  });

  test('successfully processes valid webhook', async () => {
    const payload = JSON.stringify({
      data: {
        id: 'user_123',
        email_addresses: [{
          email_address: 'test@example.com'
        }]
      },
      object: 'event',
      type: 'user.created',
      instance_id: 'ins_123',
      timestamp: Date.now()
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const msgId = 'msg_' + crypto.randomBytes(16).toString('hex');
    const signature = generateClerkSignature(payload, TEST_SECRET, timestamp, msgId);

    const response = await request(app)
      .post('/webhooks/clerk')
      .set('Content-Type', 'application/json')
      .set('svix-id', msgId)
      .set('svix-timestamp', timestamp)
      .set('svix-signature', signature)
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      type: 'user.created'
    });
  });

  test('handles multiple signatures correctly', async () => {
    const payload = JSON.stringify({
      data: { id: 'user_123' },
      object: 'event',
      type: 'user.updated',
      instance_id: 'ins_123',
      timestamp: Date.now()
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const msgId = 'msg_' + crypto.randomBytes(16).toString('hex');
    const validSignature = generateClerkSignature(payload, TEST_SECRET, timestamp, msgId);
    const invalidSignature = 'v1,aW52YWxpZF9zaWduYXR1cmU=';

    // Send multiple signatures (one valid, one invalid)
    const multiSignature = `${invalidSignature} ${validSignature}`;

    const response = await request(app)
      .post('/webhooks/clerk')
      .set('Content-Type', 'application/json')
      .set('svix-id', msgId)
      .set('svix-timestamp', timestamp)
      .set('svix-signature', multiSignature)
      .send(payload);

    expect(response.status).toBe(200);
  });

  test('rejects missing headers', async () => {
    const payload = JSON.stringify({
      data: { id: 'user_123' },
      object: 'event',
      type: 'user.created'
    });

    const response = await request(app)
      .post('/webhooks/clerk')
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Missing required Svix headers');
  });

  test('rejects invalid signature', async () => {
    const payload = JSON.stringify({
      data: { id: 'user_123' },
      object: 'event',
      type: 'user.created'
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const msgId = 'msg_' + crypto.randomBytes(16).toString('hex');

    const response = await request(app)
      .post('/webhooks/clerk')
      .set('Content-Type', 'application/json')
      .set('svix-id', msgId)
      .set('svix-timestamp', timestamp)
      .set('svix-signature', 'v1,aW52YWxpZF9zaWduYXR1cmU=')
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid signature');
  });

  test('rejects old timestamps', async () => {
    const payload = JSON.stringify({
      data: { id: 'user_123' },
      object: 'event',
      type: 'user.created'
    });

    // Timestamp from 10 minutes ago
    const oldTimestamp = (Math.floor(Date.now() / 1000) - 600).toString();
    const msgId = 'msg_' + crypto.randomBytes(16).toString('hex');
    const signature = generateClerkSignature(payload, TEST_SECRET, oldTimestamp, msgId);

    const response = await request(app)
      .post('/webhooks/clerk')
      .set('Content-Type', 'application/json')
      .set('svix-id', msgId)
      .set('svix-timestamp', oldTimestamp)
      .set('svix-signature', signature)
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Timestamp too old');
  });

  test('handles all common event types', async () => {
    const eventTypes = [
      'user.created',
      'user.updated',
      'user.deleted',
      'session.created',
      'session.ended',
      'organization.created'
    ];

    for (const eventType of eventTypes) {
      const payload = JSON.stringify({
        data: {
          id: 'resource_123',
          user_id: eventType.includes('session') ? 'user_123' : undefined,
          name: eventType.includes('organization') ? 'Test Org' : undefined
        },
        object: 'event',
        type: eventType,
        instance_id: 'ins_123',
        timestamp: Date.now()
      });

      const timestamp = Math.floor(Date.now() / 1000).toString();
      const msgId = 'msg_' + crypto.randomBytes(16).toString('hex');
      const signature = generateClerkSignature(payload, TEST_SECRET, timestamp, msgId);

      const response = await request(app)
        .post('/webhooks/clerk')
        .set('Content-Type', 'application/json')
        .set('svix-id', msgId)
        .set('svix-timestamp', timestamp)
        .set('svix-signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.type).toBe(eventType);
    }
  });

  test('handles unknown event types gracefully', async () => {
    const payload = JSON.stringify({
      data: { id: 'resource_123' },
      object: 'event',
      type: 'unknown.event.type',
      instance_id: 'ins_123',
      timestamp: Date.now()
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const msgId = 'msg_' + crypto.randomBytes(16).toString('hex');
    const signature = generateClerkSignature(payload, TEST_SECRET, timestamp, msgId);

    const response = await request(app)
      .post('/webhooks/clerk')
      .set('Content-Type', 'application/json')
      .set('svix-id', msgId)
      .set('svix-timestamp', timestamp)
      .set('svix-signature', signature)
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body.type).toBe('unknown.event.type');
  });

  test('health check endpoint works', async () => {
    const response = await request(app)
      .get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});