const crypto = require('crypto');
const request = require('supertest');

// Svix signing secrets are 'whsec_' + base64(key).
// base64 of "test_secret_key_for_nash_webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvcl9uYXNoX3dlYmhvb2tz';
process.env.NASH_WEBHOOK_SECRET = TEST_SECRET;

const { app } = require('../src/index');

// Sign exactly as Svix does for Nash:
// base64(HMAC-SHA256(base64decode(secret without whsec_), "{id}.{timestamp}.{body}"))
function sign(body, { secret = TEST_SECRET, msgId, timestamp }) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto
    .createHmac('sha256', key)
    .update(`${msgId}.${timestamp}.${body}`)
    .digest('base64');
  return `v1,${sig}`;
}

function signedHeaders(body, overrides = {}) {
  const msgId = overrides.msgId || `msg_${crypto.randomBytes(12).toString('hex')}`;
  const timestamp = overrides.timestamp || Math.floor(Date.now() / 1000).toString();
  return {
    'content-type': 'application/json',
    'svix-id': msgId,
    'svix-timestamp': timestamp,
    'svix-signature': overrides.signature || sign(body, { ...overrides, msgId, timestamp }),
  };
}

function post(body, headers) {
  return request(app).post('/webhooks/nash').set(headers).send(body);
}

const taskCreated = JSON.stringify({
  type: 'task',
  event: 'created',
  data: { id: 'job_R7FXJrfB99bpvpzf6CriJC', isBatch: false, jobConfigurations: [] },
});

describe('Nash webhook handler', () => {
  test('accepts a correctly signed webhook', async () => {
    const res = await post(taskCreated, signedHeaders(taskCreated));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, type: 'task.created' });
  });

  test('accepts when one of several space-delimited signatures matches (rotation)', async () => {
    const headers = signedHeaders(taskCreated);
    headers['svix-signature'] = `v1,${Buffer.from('nope').toString('base64')} ${headers['svix-signature']}`;
    const res = await post(taskCreated, headers);
    expect(res.status).toBe(200);
  });

  test('rejects missing Svix headers', async () => {
    const res = await post(taskCreated, { 'content-type': 'application/json' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing Svix signature headers');
  });

  test('rejects an invalid signature', async () => {
    const res = await post(taskCreated, signedHeaders(taskCreated, { signature: 'v1,aW52YWxpZA==' }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const res = await post(
      taskCreated,
      signedHeaders(taskCreated, { secret: 'whsec_b3RoZXJfc2VjcmV0X2tleQ==' })
    );
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const headers = signedHeaders(taskCreated);
    const tampered = taskCreated.replace('created', 'failed');
    const res = await post(tampered, headers);
    expect(res.status).toBe(400);
  });

  test('rejects a stale timestamp (older than 5 minutes)', async () => {
    const old = (Math.floor(Date.now() / 1000) - 600).toString();
    const res = await post(taskCreated, signedHeaders(taskCreated, { timestamp: old }));
    expect(res.status).toBe(400);
  });

  test('returns 500 when the secret is not configured', async () => {
    const headers = signedHeaders(taskCreated);
    delete process.env.NASH_WEBHOOK_SECRET;
    try {
      const res = await post(taskCreated, headers);
      expect(res.status).toBe(500);
    } finally {
      process.env.NASH_WEBHOOK_SECRET = TEST_SECRET;
    }
  });

  test.each([
    ['delivery', 'created'],
    ['delivery', 'assigned_driver'],
    ['delivery', 'dropoff_complete'],
    ['delivery', 'canceled_by_provider'],
    ['delivery', 'failed'],
    ['task', 'created'],
    ['task', 'canceled_by_provider'],
    ['task', 'failed'],
    ['courier_location', 'updated'],
    ['courier_name', 'updated'],
    ['shift', 'dispatched'],
    ['task', 'refund_created'],
  ])('handles %s.%s', async (type, event) => {
    const body = JSON.stringify({ type, event, data: { id: 'job_123' } });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe(`${type}.${event}`);
  });

  test('health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
