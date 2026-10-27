const crypto = require('crypto');
const request = require('supertest');

// The Signing Secret is a free-form string used as UTF-8 bytes
const SECRET = 'agora_test_signing_secret';
process.env.AGORA_WEBHOOK_SECRET = SECRET;

const { app, verifyAgoraWebhook } = require('../src/index');

// Same algorithm as Agora: lowercase hex HMAC-SHA1 of the raw body
function sign(payload, secret = SECRET) {
  return crypto.createHmac('sha1', secret).update(payload).digest('hex');
}

function event(eventType, payload = {}) {
  return JSON.stringify({
    noticeId: '2000001428:4330:107',
    productId: 1,
    eventType,
    notifyMs: 1611566412672,
    sid: '1FB4F1BE1D1B4C5C8A0E4E0D3B6C1B7A',
    payload: { channelName: 'test_webhook', ts: 1611566412, uid: 1234, clientSeq: 1, ...payload },
  });
}

function post(body, signature, contentType = 'application/json') {
  const req = request(app).post('/webhooks/agora').set('Content-Type', contentType);
  if (signature !== undefined) req.set('Agora-Signature', signature);
  return req.send(body);
}

describe('verifyAgoraWebhook', () => {
  const body = Buffer.from(event(101));

  test('accepts a valid signature', () => {
    expect(verifyAgoraWebhook(body, sign(body), SECRET)).toBe(true);
  });

  test('accepts an uppercase hex signature', () => {
    expect(verifyAgoraWebhook(body, sign(body).toUpperCase(), SECRET)).toBe(true);
  });

  test('rejects a wrong secret, tampered body, and missing values', () => {
    expect(verifyAgoraWebhook(body, sign(body, 'other'), SECRET)).toBe(false);
    expect(verifyAgoraWebhook(Buffer.from(event(102)), sign(body), SECRET)).toBe(false);
    expect(verifyAgoraWebhook(body, undefined, SECRET)).toBe(false);
    expect(verifyAgoraWebhook(body, sign(body), undefined)).toBe(false);
  });

  test('rejects malformed signatures without decoding them', () => {
    const good = sign(body);
    expect(verifyAgoraWebhook(body, good.slice(0, 38), SECRET)).toBe(false);
    expect(verifyAgoraWebhook(body, good + '00', SECRET)).toBe(false);
    expect(verifyAgoraWebhook(body, 'zz' + good.slice(2), SECRET)).toBe(false);
    expect(verifyAgoraWebhook(body, 'sha1=' + good, SECRET)).toBe(false);
  });
});

describe('POST /webhooks/agora', () => {
  test.each([101, 102, 103, 104, 105, 111])('accepts signed eventType %i', async (type) => {
    const body = event(type);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  test('verifies the raw bytes whatever the Content-Type', async () => {
    const body = event(101);
    const res = await post(body, sign(body), 'text/plain');
    expect(res.status).toBe(200);
  });

  test('verifies exact bytes, not re-serialised JSON', async () => {
    const body = '{ "productId": 1,   "eventType": 101, "payload": {} }';
    expect((await post(body, sign(body))).status).toBe(200);
    expect((await post(body, sign(JSON.stringify(JSON.parse(body))))).status).toBe(401);
  });

  test('returns 401 for missing, malformed, and wrong signatures', async () => {
    const body = event(101);
    expect((await post(body)).status).toBe(401);
    expect((await post(body, '')).status).toBe(401);
    expect((await post(body, 'not-hex')).status).toBe(401);
    expect((await post(body, sign(body, 'wrong'))).status).toBe(401);
  });

  test('returns 400 for signed non-JSON', async () => {
    const body = 'not json';
    expect((await post(body, sign(body), 'text/plain')).status).toBe(400);
  });

  test('handles unknown event types and products', async () => {
    const body = JSON.stringify({ productId: 3, eventType: 999, payload: {} });
    expect((await post(body, sign(body))).status).toBe(200);
  });
});
