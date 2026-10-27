const crypto = require('node:crypto');
const request = require('supertest');
const app = require('../src/index');

// Standard Webhooks secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

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
    .post('/webhooks/memos')
    .set('Content-Type', contentType)
    .set(`${prefix}-id`, msgId)
    .set(`${prefix}-timestamp`, timestamp)
    .set(`${prefix}-signature`, signature ?? sign(payload, msgId, timestamp))
    .send(payload);
}

function envelope(activityType, memo = {}) {
  return JSON.stringify({
    url: 'https://example.com/webhooks/memos',
    activityType,
    creator: 'users/1',
    memo: { name: 'memos/abc123', content: 'Hello from Memos', ...memo },
  });
}

const events = [
  'memos.memo.created',
  'memos.memo.updated',
  'memos.memo.deleted',
  'memos.memo.comment.created',
];

describe('Memos webhook handler', () => {
  let logSpy;
  let errorSpy;

  beforeEach(() => {
    process.env.MEMOS_WEBHOOK_SECRET = TEST_SECRET;
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });

  test.each(events)('handles %s', async (type) => {
    const res = await send(envelope(type));
    expect(res.status).toBe(200);
    // Memos treats any response without JSON {"code":0} as a failed delivery
    expect(res.body).toEqual({ code: 0 });
  });

  test('acknowledges an event type it does not handle', async () => {
    const res = await send(envelope('memos.memo.pinned'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ code: 0 });
  });

  test('accepts a delivery signed the same way but sent with svix-* headers', async () => {
    const res = await send(envelope('memos.memo.created'), { prefix: 'svix' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ code: 0 });
  });

  test('prefers the webhook-* headers when both sets are present', async () => {
    const payload = envelope('memos.memo.created');
    const msgId = 'msg_both';
    const timestamp = now();
    const res = await request(app)
      .post('/webhooks/memos')
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
    const res = await send(envelope('memos.memo.created'), { contentType: 'text/plain' });
    expect(res.status).toBe(200);
  });

  test('verifies the exact raw bytes, including odd whitespace', async () => {
    const payload = '{ "url" : "https://example.com",\n "activityType":"memos.memo.created", "creator":"users/1", "memo":{"content":"a  b"} }';
    const res = await send(payload);
    expect(res.status).toBe(200);
  });

  test('accepts any matching v1 entry and ignores other versions', async () => {
    const payload = envelope('memos.memo.updated');
    const msgId = 'msg_multi';
    const timestamp = now();
    const good = sign(payload, msgId, timestamp);
    const bad = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature: `v1a,ignored ${bad} ${good}` });
    expect(res.status).toBe(200);
  });

  test('rejects a missing signature header', async () => {
    const res = await request(app)
      .post('/webhooks/memos')
      .set('Content-Type', 'application/json')
      .set('webhook-id', 'msg_1')
      .set('webhook-timestamp', now())
      .send(envelope('memos.memo.created'));
    expect(res.status).toBe(400);
  });

  test('rejects a request with no webhook headers', async () => {
    const res = await request(app)
      .post('/webhooks/memos')
      .set('Content-Type', 'application/json')
      .send(envelope('memos.memo.created'));
    expect(res.status).toBe(400);
  });

  test('rejects an invalid signature', async () => {
    const res = await send(envelope('memos.memo.created'), { signature: 'v1,aW52YWxpZA==' });
    expect(res.status).toBe(401);
  });

  test('rejects a signature made with another secret', async () => {
    const payload = envelope('memos.memo.created');
    const msgId = 'msg_other_secret';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(401);
  });

  test('rejects a tampered body', async () => {
    const payload = envelope('memos.memo.created');
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp);
    const res = await send(envelope('memos.memo.deleted'), { msgId, timestamp, signature });
    expect(res.status).toBe(401);
  });

  test('rejects a stale timestamp (library window is 5 minutes)', async () => {
    const payload = envelope('memos.memo.created');
    const msgId = 'msg_stale';
    const timestamp = (Math.floor(Date.now() / 1000) - 600).toString();
    const res = await send(payload, { msgId, timestamp, signature: sign(payload, msgId, timestamp) });
    expect(res.status).toBe(401);
  });

  test('returns 400 for a verified body that is not JSON', async () => {
    const res = await send('not json');
    expect(res.status).toBe(400);
  });

  test('fails closed when the secret is not configured', async () => {
    delete process.env.MEMOS_WEBHOOK_SECRET;
    const res = await send(envelope('memos.memo.created'));
    expect(res.status).toBe(500);
  });

  test('uses a secret without the whsec_ prefix as raw bytes, as Memos does', async () => {
    const rawSecret = 'plain-text-signing-secret';
    process.env.MEMOS_WEBHOOK_SECRET = rawSecret;
    const payload = envelope('memos.memo.created');
    const timestamp = now();
    const digest = crypto.createHmac('sha256', rawSecret).update(`msg_raw.${timestamp}.${payload}`).digest('base64');
    const ok = await send(payload, { msgId: 'msg_raw', timestamp, signature: `v1,${digest}` });
    expect(ok.status).toBe(200);
    // A signature made by base64-decoding that secret (the whsec_ rule) must not verify
    const bad = await send(payload, { msgId: 'msg_raw2', timestamp });
    expect(bad.status).toBe(401);
  });

  test('error responses are not acknowledgements', async () => {
    // Memos only counts {"code":0} as success, so rejected deliveries must not carry it
    const res = await send(envelope('memos.memo.created'), { signature: 'v1,aW52YWxpZA==' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBeUndefined();
  });
});
