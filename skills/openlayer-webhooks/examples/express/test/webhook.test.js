const crypto = require('node:crypto');
const request = require('supertest');
const app = require('../src/index');

// Standard Webhooks secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';
const OTHER_SECRET = 'whsec_b3RoZXJfc2VjcmV0X2tleQ==';

// Standard Webhooks algorithm: base64(HMAC-SHA256(decoded secret, `${id}.${timestamp}.${body}`))
function sign(payload, msgId, timestamp, secret = TEST_SECRET) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${signature}`;
}

function now() {
  return Math.floor(Date.now() / 1000).toString();
}

function send(
  payload,
  { msgId = `evt_${crypto.randomBytes(12).toString('hex')}`, timestamp = now(), signature, contentType = 'application/json', prefix = 'webhook' } = {}
) {
  return request(app)
    .post('/webhooks/openlayer')
    .set('Content-Type', contentType)
    .set(`${prefix}-id`, msgId)
    .set(`${prefix}-timestamp`, timestamp)
    .set(`${prefix}-signature`, signature ?? sign(payload, msgId, timestamp))
    .send(payload);
}

function envelope(type, data = {}) {
  return JSON.stringify({
    type,
    timestamp: '2026-01-21T10:30:00Z',
    data: { test: { id: '3fa85f64-5717-4562-b3fc-2c963f66afa6', name: 'No duplicate rows', type: 'integrity' }, ...data },
  });
}

// Event names as documented at https://docs.openlayer.com/security/webhooks/events
const events = [
  ['test.created', {}],
  ['test.updated', {}],
  ['test.deleted', { test: { id: '3fa85f64-5717-4562-b3fc-2c963f66afa6' } }],
  ['tests.result.updated', { test: undefined, tests: { projectId: 'p1', projectVersionId: null, inferencePipelineId: null, total: 6, passing: 4, failing: 1, skipped: 1, running: 0 } }],
];

describe('Openlayer webhook handler', () => {
  beforeEach(() => {
    process.env.OPENLAYER_WEBHOOK_SECRET = TEST_SECRET;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });

  test.each(events)('handles %s', async (type, data) => {
    const res = await send(envelope(type, data));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, type });
  });

  test('acknowledges an event type it does not handle', async () => {
    const res = await send(envelope('project.created'));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('project.created');
  });

  test('accepts a delivery signed the same way but sent with svix-* headers', async () => {
    const res = await send(envelope('test.created'), { prefix: 'svix' });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('test.created');
  });

  test('prefers the webhook-* headers when both sets are present', async () => {
    const payload = envelope('test.created');
    const msgId = 'evt_both';
    const timestamp = now();
    const res = await request(app)
      .post('/webhooks/openlayer')
      .set('Content-Type', 'application/json')
      .set('webhook-id', msgId)
      .set('webhook-timestamp', timestamp)
      .set('webhook-signature', sign(payload, msgId, timestamp))
      .set('svix-id', 'evt_other')
      .set('svix-timestamp', timestamp)
      .set('svix-signature', 'v1,AAAA')
      .send(payload);
    expect(res.status).toBe(200);
  });

  test('verifies the raw bytes whatever the content type', async () => {
    const res = await send(envelope('test.created'), { contentType: 'text/plain' });
    expect(res.status).toBe(200);
  });

  test('verifies the exact raw bytes, including odd whitespace', async () => {
    const payload = '{ "type" : "test.updated",\n "timestamp":"2026-09-30T10:00:00.000Z", "data":{"test":{"id":"t1"}} }';
    const res = await send(payload);
    expect(res.status).toBe(200);
  });

  test('accepts any matching v1 entry and ignores other versions', async () => {
    const payload = envelope('test.deleted');
    const msgId = 'evt_multi';
    const timestamp = now();
    const good = sign(payload, msgId, timestamp);
    const bad = sign(payload, msgId, timestamp, OTHER_SECRET);
    const res = await send(payload, { msgId, timestamp, signature: `v1a,ignored ${bad} ${good}` });
    expect(res.status).toBe(200);
  });

  test('rejects a missing signature header', async () => {
    const res = await request(app)
      .post('/webhooks/openlayer')
      .set('Content-Type', 'application/json')
      .set('webhook-id', 'evt_1')
      .set('webhook-timestamp', now())
      .send(envelope('test.created'));
    expect(res.status).toBe(400);
  });

  test('rejects a request with no webhook headers', async () => {
    const res = await request(app)
      .post('/webhooks/openlayer')
      .set('Content-Type', 'application/json')
      .send(envelope('test.created'));
    expect(res.status).toBe(400);
  });

  test('rejects an invalid signature', async () => {
    const res = await send(envelope('test.created'), { signature: 'v1,aW52YWxpZA==' });
    expect(res.status).toBe(401);
  });

  test('rejects a signature made with another secret', async () => {
    const payload = envelope('test.created');
    const msgId = 'evt_other_secret';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, OTHER_SECRET);
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(401);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'evt_tamper';
    const timestamp = now();
    const signature = sign(envelope('test.created'), msgId, timestamp);
    const res = await send(envelope('test.deleted'), { msgId, timestamp, signature });
    expect(res.status).toBe(401);
  });

  test('rejects a stale timestamp (library window is 5 minutes)', async () => {
    const payload = envelope('test.created');
    const msgId = 'evt_stale';
    const timestamp = (Math.floor(Date.now() / 1000) - 600).toString();
    const res = await send(payload, { msgId, timestamp, signature: sign(payload, msgId, timestamp) });
    expect(res.status).toBe(401);
  });

  test('returns 400 for a verified body that is not JSON', async () => {
    const res = await send('not json');
    expect(res.status).toBe(400);
  });

  test('fails closed when the secret is not configured', async () => {
    delete process.env.OPENLAYER_WEBHOOK_SECRET;
    const res = await send(envelope('test.created'));
    expect(res.status).toBe(500);
  });

  test('fails closed when the secret is not a whsec_ secret', async () => {
    process.env.OPENLAYER_WEBHOOK_SECRET = 'not-a-whsec-secret';
    const res = await send(envelope('test.created'));
    expect(res.status).toBe(500);
  });
});
