import crypto from 'node:crypto';
import request from 'supertest';
import { app } from '../src/index.js';

// Svix-format secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Svix algorithm: base64(HMAC-SHA256(decoded secret, `${id}.${timestamp}.${body}`))
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
  { msgId = `msg_${crypto.randomBytes(12).toString('hex')}`, timestamp = now(), signature, contentType = 'application/json', prefix = 'svix' } = {}
) {
  return request(app)
    .post('/webhooks/cuuro')
    .set('Content-Type', contentType)
    .set(`${prefix}-id`, msgId)
    .set(`${prefix}-timestamp`, timestamp)
    .set(`${prefix}-signature`, signature ?? sign(payload, msgId, timestamp))
    .send(payload);
}

// Cuuro bodies are { data: { id }, event }; data.id is the company or analysis id
const ID = '0191e29a-1644-7972-9466-18ada4a3636e';
const body = (event, id = ID) => JSON.stringify({ data: { id }, event });

const events = ['startup.created', 'analysis.created', 'analysis.completed'];

describe('Cuuro webhook handler', () => {
  beforeEach(() => {
    process.env.CUURO_WEBHOOK_SECRET = TEST_SECRET;
  });

  test.each(events)('handles %s', async (type) => {
    const res = await send(body(type));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type });
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(body('analysis.something_new'));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('analysis.something_new');
  });

  test('accepts a verified delivery without an event field', async () => {
    const res = await send(JSON.stringify({ data: { id: ID } }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type: null });
  });

  test('rejects a verified body that is not a JSON object', async () => {
    const res = await send('[1,2,3]');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSON');
  });

  test('rejects a verified body that is not JSON', async () => {
    const res = await send('not json');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSON');
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(body('analysis.created'), { contentType: 'application/octet-stream' });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed the same way but sent with webhook-* headers', async () => {
    const res = await send(body('analysis.completed'), { prefix: 'webhook' });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('analysis.completed');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = body('analysis.created');
    const msgId = 'msg_rotation';
    const timestamp = now();
    const signature = `v1,aW52YWxpZF9zaWduYXR1cmU= ${sign(payload, msgId, timestamp)}`;
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(200);
  });

  test('rejects missing headers', async () => {
    const res = await request(app).post('/webhooks/cuuro').set('Content-Type', 'application/json').send('{}');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required webhook headers');
  });

  test('rejects an invalid signature', async () => {
    const res = await send(body('analysis.created'), { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = body('analysis.created');
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign(body('analysis.created', 'other-id'), msgId, timestamp);
    const res = await send(body('analysis.created'), { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('ignores signature versions other than v1', async () => {
    const payload = body('analysis.created');
    const msgId = 'msg_v1a';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp).replace('v1,', 'v1a,');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send(body('analysis.created'), { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.CUURO_WEBHOOK_SECRET;
    const res = await send(body('analysis.created'));
    expect(res.status).toBe(500);
  });

  test('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
