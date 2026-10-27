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

// prefix: 'svix' (Sohar Health as documented) or 'webhook' (Standard Webhooks names for the same values)
function send(payload, { msgId = `msg_${crypto.randomBytes(12).toString('hex')}`, timestamp = now(), signature, contentType = 'application/json', prefix = 'svix' } = {}) {
  return request(app)
    .post('/webhooks/sohar-health')
    .set('Content-Type', contentType)
    .set(`${prefix}-id`, msgId)
    .set(`${prefix}-timestamp`, timestamp)
    .set(`${prefix}-signature`, signature ?? sign(payload, msgId, timestamp))
    .send(payload);
}

// Sohar Health's bodies are flat: `event` plus the resource id, `id` and `status` (documented examples)
function body(event, extra = {}) {
  const base = event.includes('flow.callback')
    ? { event, flowRunId: '990cdad8-1438-4bbd-8b55-120b56e87540', input: { type: 'object', properties: { memberId: { type: 'string' } } } }
    : event.includes('flow.')
      ? { event, flowRunId: '990cdad8-1438-4bbd-8b55-120b56e87540', flowId: '33093874-1e3d-4ea9-b988-8cc64e5a4079', status: 'COMPLETE', stateId: 'create-verification' }
      : event.includes('discovery.')
        ? { event, discoveryId: 'fb701ac1-1246-4860-b1ec-bd916b97a990', status: 'complete', id: '123456' }
        : { event, verificationId: '990cdad8-1438-4bbd-8b55-120b56e87540', id: '123456', status: event.includes('pending') ? 'pending' : 'complete.eligible' };
  return JSON.stringify({ ...base, ...extra });
}

// The 10 documented event types
const EVENTS = [
  'verification.updated', 'sandbox.verification.updated',
  'verification.pending', 'sandbox.verification.pending',
  'discovery.updated', 'sandbox.discovery.updated',
  'flow.updated', 'sandbox.flow.updated',
  'flow.callback', 'sandbox.flow.callback',
];

describe('Sohar Health webhook handler', () => {
  beforeEach(() => {
    process.env.SOHAR_HEALTH_WEBHOOK_SECRET = TEST_SECRET;
  });

  test.each(EVENTS)('handles event %s', async (event) => {
    const res = await send(body(event));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, event });
  });

  test('handles unknown events gracefully', async () => {
    const res = await send(body('something.new'));
    expect(res.status).toBe(200);
    expect(res.body.event).toBe('something.new');
  });

  test('handles a body without an event field', async () => {
    const res = await send('{}');
    expect(res.status).toBe(200);
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(body('verification.updated'), { contentType: 'application/octet-stream' });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed the same way but sent with webhook-* headers', async () => {
    const res = await send(body('verification.updated'), { prefix: 'webhook' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, event: 'verification.updated' });
  });

  test('rejects an invalid signature sent with webhook-* headers', async () => {
    const res = await send(body('verification.updated'), { prefix: 'webhook', signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = body('flow.updated');
    const msgId = 'msg_rotation';
    const timestamp = now();
    const signature = `v1,aW52YWxpZF9zaWduYXR1cmU= ${sign(payload, msgId, timestamp)}`;
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(200);
  });

  test('ignores signature versions other than v1', async () => {
    const payload = body('flow.updated');
    const msgId = 'msg_v1a';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp).replace('v1,', 'v1a,');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects missing headers', async () => {
    const res = await request(app).post('/webhooks/sohar-health').set('Content-Type', 'application/json').send('{}');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required webhook headers');
  });

  test('rejects an invalid signature', async () => {
    const res = await send(body('verification.updated'), { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = body('verification.updated');
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign(body('verification.pending'), msgId, timestamp);
    const res = await send(body('verification.updated'), { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send(body('verification.updated'), { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.SOHAR_HEALTH_WEBHOOK_SECRET;
    const res = await send(body('verification.updated'));
    expect(res.status).toBe(500);
  });

  test('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
