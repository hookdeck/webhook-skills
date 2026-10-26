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
  { msgId = `msg_${crypto.randomBytes(12).toString('hex')}`, timestamp = now(), signature, contentType = 'application/json', prefix = 'webhook' } = {}
) {
  return request(app)
    .post('/webhooks/prividium')
    .set('Content-Type', contentType)
    .set(`${prefix}-id`, msgId)
    .set(`${prefix}-timestamp`, timestamp)
    .set(`${prefix}-signature`, signature ?? sign(payload, msgId, timestamp))
    .send(payload);
}

// The body format is not documented; this is an illustrative payload
const body = (extra = {}) => JSON.stringify({ address: '0x66ec845c0b07d1728b1b14921d561fe7963a5ab8', block_number: 31200, ...extra });

describe('Prividium webhook handler', () => {
  beforeEach(() => {
    process.env.PRIVIDIUM_WEBHOOK_SECRET = TEST_SECRET;
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

  test('accepts a correctly signed delivery', async () => {
    const res = await send(body());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, duplicate: false });
  });

  test('accepts a delivery signed the same way but sent with svix-* headers', async () => {
    const res = await send(body(), { prefix: 'svix' });
    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(false);
  });

  test('prefers the webhook-* headers when both sets are present', async () => {
    const payload = body();
    const msgId = 'msg_both';
    const timestamp = now();
    const res = await request(app)
      .post('/webhooks/prividium')
      .set('Content-Type', 'application/json')
      .set('webhook-id', msgId)
      .set('webhook-timestamp', timestamp)
      .set('webhook-signature', sign(payload, msgId, timestamp))
      .set('svix-id', 'msg_other')
      .set('svix-timestamp', timestamp)
      .set('svix-signature', 'v1,AAAA')
      .send(payload);
    expect(res.status).toBe(200);
  });

  test('verifies the raw bytes whatever the content type', async () => {
    const res = await send(body(), { contentType: 'text/plain' });
    expect(res.status).toBe(200);
  });

  test('verifies the exact raw bytes, including odd whitespace', async () => {
    const res = await send('{ "block_number" : 1,\n "address":"0xabc" }');
    expect(res.status).toBe(200);
  });

  test('accepts a verified body that is not JSON', async () => {
    const res = await send('not json');
    expect(res.status).toBe(200);
  });

  test('accepts any matching v1 entry and ignores other versions', async () => {
    const payload = body();
    const msgId = 'msg_multi';
    const timestamp = now();
    const good = sign(payload, msgId, timestamp);
    const bad = sign(payload, msgId, timestamp, OTHER_SECRET);
    const res = await send(payload, { msgId, timestamp, signature: `v1a,ignored ${bad} ${good}` });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed with either key listed during a rotation', async () => {
    process.env.PRIVIDIUM_WEBHOOK_SECRET = `${OTHER_SECRET},${TEST_SECRET}`;
    const res = await send(body());
    expect(res.status).toBe(200);
  });

  test('reports a repeated webhook-id as a duplicate', async () => {
    const payload = body();
    const timestamp = now();
    const first = await send(payload, { msgId: 'msg_dup', timestamp });
    const second = await send(payload, { msgId: 'msg_dup', timestamp });
    expect(first.body.duplicate).toBe(false);
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
  });

  test('rejects a missing signature header', async () => {
    const res = await request(app)
      .post('/webhooks/prividium')
      .set('Content-Type', 'application/json')
      .set('webhook-id', 'msg_1')
      .set('webhook-timestamp', now())
      .send(body());
    expect(res.status).toBe(400);
  });

  test('rejects a request with no webhook headers', async () => {
    const res = await request(app).post('/webhooks/prividium').set('Content-Type', 'application/json').send(body());
    expect(res.status).toBe(400);
  });

  test('rejects an invalid signature', async () => {
    const res = await send(body(), { signature: 'v1,aW52YWxpZA==' });
    expect(res.status).toBe(401);
  });

  test('rejects a signature made with another secret', async () => {
    const payload = body();
    const msgId = 'msg_other_secret';
    const timestamp = now();
    const res = await send(payload, { msgId, timestamp, signature: sign(payload, msgId, timestamp, OTHER_SECRET) });
    expect(res.status).toBe(401);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign(body(), msgId, timestamp);
    const res = await send(body({ block_number: 99999 }), { msgId, timestamp, signature });
    expect(res.status).toBe(401);
  });

  test('rejects a stale timestamp (library window is 5 minutes)', async () => {
    const payload = body();
    const msgId = 'msg_stale';
    const timestamp = (Math.floor(Date.now() / 1000) - 600).toString();
    const res = await send(payload, { msgId, timestamp, signature: sign(payload, msgId, timestamp) });
    expect(res.status).toBe(401);
  });

  test('fails closed when the secret is not configured', async () => {
    delete process.env.PRIVIDIUM_WEBHOOK_SECRET;
    const res = await send(body());
    expect(res.status).toBe(500);
  });

  test('fails closed when the secret is not a whsec_ secret', async () => {
    process.env.PRIVIDIUM_WEBHOOK_SECRET = 'not-a-whsec-secret';
    const res = await send(body());
    expect(res.status).toBe(500);
  });
});
