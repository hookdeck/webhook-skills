import request from 'supertest';
import crypto from 'crypto';

// Svix-style secret: 'whsec_' + base64 key. base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';
process.env.TASKRABBIT_WEBHOOK_SECRET = TEST_SECRET;

const { app, server } = await import('../src/index.js');

const PROJECT_UUID = '550e8400-e29b-41d4-a716-446655440000';

// Example payloads from Taskrabbit's webhook docs
const PAYLOADS = {
  'project.completed': {
    event: 'project.completed',
    project_uuid: PROJECT_UUID,
    timestamp: '2025-01-22T10:00:00Z',
    agreement_external_reference: 'REF-12345',
  },
  'project.canceled': {
    event: 'project.canceled',
    project_uuid: PROJECT_UUID,
    cancellation_reason: 'order_canceled',
    timestamp: '2025-01-22T10:00:00Z',
    agreement_external_reference: 'REF-12345',
  },
  'project.rescheduled': {
    event: 'project.rescheduled',
    project_uuid: PROJECT_UUID,
    new_start_time: '2025-06-15T09:15:00Z',
    previous_start_time: '2025-06-15T07:00:00Z',
    timestamp: '2025-06-15T09:15:00Z',
    agreement_external_reference: 'REF-12345',
  },
};

// Generate a valid Svix signature: HMAC-SHA256 over "<id>.<timestamp>.<raw body>",
// keyed with the base64-decoded bytes after "whsec_", base64-encoded, prefixed "v1,".
function generateSignature(payload, secret, timestamp, msgId) {
  const key = Buffer.from(secret.split('_')[1], 'base64');
  const signature = crypto
    .createHmac('sha256', key)
    .update(`${msgId}.${timestamp}.${payload}`)
    .digest('base64');
  return `v1,${signature}`;
}

function signedHeaders(payload, { timestamp, msgId } = {}) {
  const ts = timestamp || Math.floor(Date.now() / 1000).toString();
  const id = msgId || 'msg_' + crypto.randomBytes(12).toString('hex');
  return {
    'Content-Type': 'application/json',
    'svix-id': id,
    'svix-timestamp': ts,
    'svix-signature': generateSignature(payload, TEST_SECRET, ts, id),
  };
}

describe('Taskrabbit Webhook Handler', () => {
  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  test('accepts a valid project.completed webhook', async () => {
    const payload = JSON.stringify(PAYLOADS['project.completed']);
    const response = await request(app)
      .post('/webhooks/taskrabbit')
      .set(signedHeaders(payload))
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, event: 'project.completed' });
  });

  test.each(Object.keys(PAYLOADS))('handles %s', async (eventName) => {
    const payload = JSON.stringify(PAYLOADS[eventName]);
    const response = await request(app)
      .post('/webhooks/taskrabbit')
      .set(signedHeaders(payload))
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body.event).toBe(eventName);
  });

  test('accepts webhook-* header aliases', async () => {
    const payload = JSON.stringify(PAYLOADS['project.canceled']);
    const h = signedHeaders(payload);
    const response = await request(app)
      .post('/webhooks/taskrabbit')
      .set('Content-Type', 'application/json')
      .set('webhook-id', h['svix-id'])
      .set('webhook-timestamp', h['svix-timestamp'])
      .set('webhook-signature', h['svix-signature'])
      .send(payload);

    expect(response.status).toBe(200);
  });

  test('accepts when any of multiple signatures matches (secret rotation)', async () => {
    const payload = JSON.stringify(PAYLOADS['project.rescheduled']);
    const h = signedHeaders(payload);
    h['svix-signature'] = `v1,aW52YWxpZF9zaWduYXR1cmU= ${h['svix-signature']}`;
    const response = await request(app)
      .post('/webhooks/taskrabbit')
      .set(h)
      .send(payload);

    expect(response.status).toBe(200);
  });

  test('rejects missing headers', async () => {
    const payload = JSON.stringify(PAYLOADS['project.completed']);
    const response = await request(app)
      .post('/webhooks/taskrabbit')
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Missing required');
  });

  test('rejects an invalid signature', async () => {
    const payload = JSON.stringify(PAYLOADS['project.completed']);
    const h = signedHeaders(payload);
    h['svix-signature'] = 'v1,aW52YWxpZF9zaWduYXR1cmU=';
    const response = await request(app)
      .post('/webhooks/taskrabbit')
      .set(h)
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid signature');
  });

  test('rejects a tampered body', async () => {
    const payload = JSON.stringify(PAYLOADS['project.completed']);
    const tampered = payload.replace('REF-12345', 'REF-99999');
    const response = await request(app)
      .post('/webhooks/taskrabbit')
      .set(signedHeaders(payload))
      .send(tampered);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid signature');
  });

  test('rejects an old timestamp', async () => {
    const payload = JSON.stringify(PAYLOADS['project.completed']);
    const oldTimestamp = (Math.floor(Date.now() / 1000) - 600).toString();
    const response = await request(app)
      .post('/webhooks/taskrabbit')
      .set(signedHeaders(payload, { timestamp: oldTimestamp }))
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Timestamp too old');
  });

  test('handles unknown events gracefully', async () => {
    const payload = JSON.stringify({ event: 'project.some_new_event', project_uuid: PROJECT_UUID, timestamp: '2025-01-22T10:00:00Z' });
    const response = await request(app)
      .post('/webhooks/taskrabbit')
      .set(signedHeaders(payload))
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body.event).toBe('project.some_new_event');
  });

  test('health check endpoint works', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
