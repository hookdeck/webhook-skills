import request from 'supertest';
import crypto from 'node:crypto';
import { app, server } from '../src/index.js';

// Test signing secret. Svix secrets are 'whsec_' + base64(key).
// base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Generate a valid signature the same way Svix does for Reducto:
// base64(HMAC_SHA256(base64Decode(secret_after_whsec_), `${id}.${timestamp}.${payload}`))
function generateSignature(payload, secret, timestamp, msgId) {
  const signedContent = `${msgId}.${timestamp}.${payload}`;
  const key = Buffer.from(secret.split('_')[1], 'base64');
  const signature = crypto.createHmac('sha256', key).update(signedContent).digest('base64');
  return `v1,${signature}`;
}

function newMsgId() {
  return 'msg_' + crypto.randomBytes(16).toString('hex');
}

function now() {
  return Math.floor(Date.now() / 1000).toString();
}

function jobPayload(status) {
  return JSON.stringify({
    status,
    job_id: 'a1b9090e-c9ae-420b-9726-f658afbbe338',
    metadata: { user_id: '123', document_type: 'invoice' },
  });
}

function send(payload, headers) {
  return request(app)
    .post('/webhooks/reducto')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(payload);
}

function signedHeaders(payload, timestamp = now(), msgId = newMsgId()) {
  return {
    'svix-id': msgId,
    'svix-timestamp': timestamp,
    'svix-signature': generateSignature(payload, TEST_SECRET, timestamp, msgId),
  };
}

describe('Reducto Webhook Handler', () => {
  beforeAll(() => {
    process.env.REDUCTO_WEBHOOK_SECRET = TEST_SECRET;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  test('processes a Completed job webhook', async () => {
    const payload = jobPayload('Completed');
    const response = await send(payload, signedHeaders(payload));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      received: true,
      status: 'Completed',
      job_id: 'a1b9090e-c9ae-420b-9726-f658afbbe338',
    });
  });

  test('processes a Failed job webhook', async () => {
    const payload = jobPayload('Failed');
    const response = await send(payload, signedHeaders(payload));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('Failed');
  });

  test('handles unknown statuses gracefully', async () => {
    const payload = jobPayload('Pending');
    const response = await send(payload, signedHeaders(payload));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('Pending');
  });

  test('accepts multiple signatures (secret rotation)', async () => {
    const payload = jobPayload('Completed');
    const headers = signedHeaders(payload);
    headers['svix-signature'] = `v1,aW52YWxpZF9zaWduYXR1cmU= ${headers['svix-signature']}`;

    const response = await send(payload, headers);
    expect(response.status).toBe(200);
  });

  test('rejects missing headers', async () => {
    const response = await send(jobPayload('Completed'), {});

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Missing required');
  });

  test('rejects an invalid signature', async () => {
    const payload = jobPayload('Completed');
    const headers = signedHeaders(payload);
    headers['svix-signature'] = 'v1,aW52YWxpZF9zaWduYXR1cmU=';

    const response = await send(payload, headers);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid signature');
  });

  test('rejects a tampered body', async () => {
    const payload = jobPayload('Failed');
    const headers = signedHeaders(payload);

    const response = await send(jobPayload('Completed'), headers);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid signature');
  });

  test('rejects a signature made with the wrong secret', async () => {
    const payload = jobPayload('Completed');
    const timestamp = now();
    const msgId = newMsgId();
    const wrongSecret = 'whsec_' + Buffer.from('wrong_secret_key').toString('base64');

    const response = await send(payload, {
      'svix-id': msgId,
      'svix-timestamp': timestamp,
      'svix-signature': generateSignature(payload, wrongSecret, timestamp, msgId),
    });
    expect(response.status).toBe(400);
  });

  test('rejects an old timestamp', async () => {
    const payload = jobPayload('Completed');
    // 10 minutes ago — outside the 5-minute tolerance.
    const old = (Math.floor(Date.now() / 1000) - 600).toString();

    const response = await send(payload, signedHeaders(payload, old));
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Timestamp too old');
  });

  test('health check endpoint works', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
