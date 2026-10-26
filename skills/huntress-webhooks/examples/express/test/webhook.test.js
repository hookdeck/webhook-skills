import crypto from 'node:crypto';
import request from 'supertest';
import { app } from '../src/index.js';

// Svix secrets are 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Same algorithm Huntress uses: base64(HMAC-SHA256(decoded secret, `${id}.${timestamp}.${body}`))
function sign(payload, msgId, timestamp, secret = TEST_SECRET) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${signature}`;
}

function now() {
  return Math.floor(Date.now() / 1000).toString();
}

function send(payload, { msgId = `msg_${crypto.randomBytes(12).toString('hex')}`, timestamp = now(), signature, contentType = 'application/json' } = {}) {
  return request(app)
    .post('/webhooks/huntress')
    .set('Content-Type', contentType)
    .set('svix-id', msgId)
    .set('svix-timestamp', timestamp)
    .set('svix-signature', signature ?? sign(payload, msgId, timestamp))
    .send(payload);
}

describe('Huntress webhook handler', () => {
  beforeEach(() => {
    process.env.HUNTRESS_WEBHOOK_SECRET = TEST_SECRET;
  });

  test('accepts a valid body without a type field', async () => {
    const res = await send(JSON.stringify({ hello: 'world' }));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.type).toBeNull();
  });

  test('reports the type when the body has one', async () => {
    const res = await send(JSON.stringify({ type: 'example.event', data: {} }));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('example.event');
  });

  test('verifies regardless of Content-Type', async () => {
    const res = await send(JSON.stringify({ a: 1 }), { contentType: 'text/plain' });
    expect(res.status).toBe(200);
  });

  test('accepts any matching signature among several', async () => {
    const payload = JSON.stringify({ a: 1 });
    const msgId = 'msg_rotation';
    const timestamp = now();
    const signature = `v1,aW52YWxpZF9zaWduYXR1cmU= ${sign(payload, msgId, timestamp)}`;
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(200);
  });

  test('rejects missing headers', async () => {
    const res = await request(app)
      .post('/webhooks/huntress')
      .set('Content-Type', 'application/json')
      .send('{}');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required webhook headers');
  });

  test('rejects an invalid signature', async () => {
    const res = await send('{"a":1}', { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = '{"a":1}';
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign('{"a":1}', msgId, timestamp);
    const res = await send('{"a":2}', { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send('{"a":1}', { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Timestamp too old');
  });

  test('rejects a validly signed body that is not JSON', async () => {
    const res = await send('not json');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSON');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.HUNTRESS_WEBHOOK_SECRET;
    const res = await send('{"a":1}');
    expect(res.status).toBe(500);
  });

  test('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
