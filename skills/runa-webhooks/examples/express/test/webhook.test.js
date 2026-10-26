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

// prefix: 'svix' (Runa as documented) or 'webhook' (Standard Webhooks names for the same values)
function send(payload, { msgId = `msg_${crypto.randomBytes(12).toString('hex')}`, timestamp = now(), signature, contentType = 'application/json', prefix = 'svix' } = {}) {
  return request(app)
    .post('/webhooks/runa')
    .set('Content-Type', contentType)
    .set(`${prefix}-id`, msgId)
    .set(`${prefix}-timestamp`, timestamp)
    .set(`${prefix}-signature`, signature ?? sign(payload, msgId, timestamp))
    .send(payload);
}

// order.completion with status COMPLETED: an order summary (bare resource, no envelope)
function completedOrder(overrides = {}) {
  return JSON.stringify({
    id: 'ord_12345',
    status: 'COMPLETED',
    created_at: '2025-08-26T18:39:20.000000+00:00',
    completed_at: '2025-08-26T18:39:27.006833+00:00',
    payment_method: { type: 'ACCOUNT_BALANCE', currency: 'USD' },
    currency: 'USD',
    total_price: '10.00',
    total_discount: '1.00',
    ...overrides,
  });
}

// order.completion with status FAILED: only { id, status }
function failedOrder() {
  return JSON.stringify({ id: 'ord_67890', status: 'FAILED' });
}

// product.update: { product_code, old_state, new_state, timestamp }
function productUpdate({ productCode = 'XYZ-US', orderable = false, timestamp = '2025-08-26T18:39:27.006833+00:00' } = {}) {
  const state = (isOrderable) => ({
    price_multiplier: '0.0098',
    is_orderable: isOrderable,
    denominations: { type: 'fixed', available_list: ['10', '25', '50'], minimum_value: '10.0', maximum_value: '50.0' },
  });
  return JSON.stringify({ product_code: productCode, old_state: state(!orderable), new_state: state(orderable), timestamp });
}

describe('Runa webhook handler', () => {
  beforeEach(() => {
    process.env.RUNA_WEBHOOK_SECRET = TEST_SECRET;
  });

  test('handles order.completion (COMPLETED)', async () => {
    const res = await send(completedOrder());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, event: 'order.completion' });
  });

  test('handles order.completion (FAILED stub)', async () => {
    const res = await send(failedOrder());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, event: 'order.completion' });
  });

  test('handles product.update', async () => {
    const res = await send(productUpdate({ productCode: 'BASIC-US' }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, event: 'product.update' });
  });

  test('ignores a product.update older than the last one seen', async () => {
    const productCode = 'ORDER-US';
    const newer = await send(productUpdate({ productCode, orderable: true, timestamp: '2025-08-26T18:40:00.000000+00:00' }));
    expect(newer.body).toEqual({ received: true, event: 'product.update' });
    const older = await send(productUpdate({ productCode, orderable: false, timestamp: '2025-08-26T18:39:00.000000+00:00' }));
    expect(older.status).toBe(200);
    expect(older.body).toEqual({ received: true, event: 'product.update', ignored: 'stale' });
  });

  test('acknowledges payloads it does not recognise', async () => {
    const res = await send('{"hello":"world"}');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, event: null });
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(completedOrder(), { contentType: 'application/octet-stream' });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed the same way but sent with webhook-* headers', async () => {
    const res = await send(completedOrder(), { prefix: 'webhook' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, event: 'order.completion' });
  });

  test('rejects an invalid signature sent with webhook-* headers', async () => {
    const res = await send(completedOrder(), { prefix: 'webhook', signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = completedOrder();
    const msgId = 'msg_rotation';
    const timestamp = now();
    const signature = `v1,aW52YWxpZF9zaWduYXR1cmU= ${sign(payload, msgId, timestamp)}`;
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(200);
  });

  test('ignores signature versions other than v1', async () => {
    const payload = completedOrder();
    const msgId = 'msg_v1a';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp).replace('v1,', 'v1a,');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects missing headers', async () => {
    const res = await request(app).post('/webhooks/runa').set('Content-Type', 'application/json').send('{}');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required webhook headers');
  });

  test('rejects an invalid signature', async () => {
    const res = await send(completedOrder(), { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = completedOrder();
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign(failedOrder(), msgId, timestamp);
    const res = await send(completedOrder(), { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send(completedOrder(), { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Timestamp too old');
  });

  test('rejects a validly signed body that is not JSON', async () => {
    const res = await send('not json');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSON');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.RUNA_WEBHOOK_SECRET;
    const res = await send(completedOrder());
    expect(res.status).toBe(500);
  });

  test('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
