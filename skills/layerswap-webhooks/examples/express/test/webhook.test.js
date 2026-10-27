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

// prefix: 'svix' (Layerswap as documented) or 'webhook' (Standard Webhooks names for the same values)
function send(payload, { msgId = `msg_${crypto.randomBytes(12).toString('hex')}`, timestamp = now(), signature, contentType = 'application/json', prefix = 'svix' } = {}) {
  return request(app)
    .post('/webhooks/layerswap')
    .set('Content-Type', contentType)
    .set(`${prefix}-id`, msgId)
    .set(`${prefix}-timestamp`, timestamp)
    .set(`${prefix}-signature`, signature ?? sign(payload, msgId, timestamp))
    .send(payload);
}

// Layerswap's body: { swap, quote, deposit_actions } (no event-type field; swap.status is the state)
function body(status, swap = {}) {
  return JSON.stringify({
    swap: {
      id: 'SWAP_ID',
      status,
      destination_address: '0x0000000000000000000000000000000000000001',
      requested_amount: 100,
      fail_reason: null,
      metadata: { reference_id: 'your-external-id' },
      transactions: [],
      ...swap,
    },
    quote: { receive_amount: 99.5, min_receive_amount: 99.0 },
    deposit_actions: [],
  });
}

// swap.status values from the swap lifecycle docs
const STATUSES = ['user_transfer_pending', 'ls_transfer_pending', 'completed', 'failed', 'expired', 'pending_refund', 'refunded'];

describe('Layerswap webhook handler', () => {
  beforeEach(() => {
    process.env.LAYERSWAP_WEBHOOK_SECRET = TEST_SECRET;
  });

  test.each(STATUSES)('handles swap status %s', async (status) => {
    const res = await send(body(status));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, status });
  });

  test('handles unknown statuses gracefully', async () => {
    const res = await send(body('something_new'));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('something_new');
  });

  test('handles a body without a swap object', async () => {
    const res = await send('{}');
    expect(res.status).toBe(200);
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(body('completed'), { contentType: 'application/octet-stream' });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed the same way but sent with webhook-* headers', async () => {
    const res = await send(body('completed'), { prefix: 'webhook' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, status: 'completed' });
  });

  test('rejects an invalid signature sent with webhook-* headers', async () => {
    const res = await send(body('completed'), { prefix: 'webhook', signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = body('refunded');
    const msgId = 'msg_rotation';
    const timestamp = now();
    const signature = `v1,aW52YWxpZF9zaWduYXR1cmU= ${sign(payload, msgId, timestamp)}`;
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(200);
  });

  test('ignores signature versions other than v1', async () => {
    const payload = body('refunded');
    const msgId = 'msg_v1a';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp).replace('v1,', 'v1a,');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects missing headers', async () => {
    const res = await request(app).post('/webhooks/layerswap').set('Content-Type', 'application/json').send('{}');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required webhook headers');
  });

  test('rejects an invalid signature', async () => {
    const res = await send(body('completed'), { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = body('completed');
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign(body('failed'), msgId, timestamp);
    const res = await send(body('completed'), { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send(body('completed'), { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.LAYERSWAP_WEBHOOK_SECRET;
    const res = await send(body('completed'));
    expect(res.status).toBe(500);
  });

  test('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
