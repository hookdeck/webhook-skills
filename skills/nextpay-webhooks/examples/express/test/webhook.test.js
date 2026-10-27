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

// prefix: 'svix' (NextPay as documented) or 'webhook' (Standard Webhooks names for the same values)
function send(payload, { msgId = `msg_${crypto.randomBytes(12).toString('hex')}`, timestamp = now(), signature, contentType = 'application/json', prefix = 'svix' } = {}) {
  return request(app)
    .post('/webhooks/nextpay')
    .set('Content-Type', contentType)
    .set(`${prefix}-id`, msgId)
    .set(`${prefix}-timestamp`, timestamp)
    .set(`${prefix}-signature`, signature ?? sign(payload, msgId, timestamp))
    .send(payload);
}

// v2.* events use {event, payload}; payout and platform events use {type, data}
function envelope(name, object = {}) {
  const body = name.startsWith('v2.') ? { event: name, payload: object } : { type: name, data: object };
  return JSON.stringify({ id: 'evt_2xPq81', ...body });
}

const EVENT_TYPES = [
  'v2.payment_intent.succeeded', 'v2.payment_intent.canceled',
  'v2.payment_instrument.used', 'v2.payment_instrument.payment_received',
  'v2.payment_instrument.payment_settled', 'payout_request.creation_failed',
  'payout_request.queued', 'payout_request.queue_failed',
  'payout_request.processed', 'payout.succeeded',
  'payout.failed', 'payout.processed',
  'payout.processing_failed', 'deposit.confirmed',
  'direct_transfer.received', 'legal_entity.verification_status_changed',
];

describe('NextPay webhook handler', () => {
  beforeEach(() => {
    process.env.NEXTPAY_WEBHOOK_SECRET = TEST_SECRET;
  });

  test('covers the 16 documented events', () => {
    expect(new Set(EVENT_TYPES).size).toBe(16);
  });

  test.each(EVENT_TYPES)('handles %s', async (type) => {
    const res = await send(envelope(type, { id: 'obj_01J', status: 'completed' }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type });
  });

  test.each([
    ['a v2.* event reads {event, payload}', 'v2.payment_intent.succeeded', { event: 'v2.payment_intent.succeeded', payload: { id: 'pi_1', external_id: 'order-98765', amount: 150000, status: 'succeeded' } }],
    ['a payout event reads {type, data}', 'payout_request.processed', { type: 'payout_request.processed', data: { id: 'pr_1', amount_cents: 50000, status: 'completed' } }],
  ])('%s', async (_label, type, body) => {
    const res = await send(JSON.stringify(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type });
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(envelope('nextpay.something.new'));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('nextpay.something.new');
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(envelope('payout.succeeded'), { contentType: 'application/octet-stream' });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed the same way but sent with webhook-* headers', async () => {
    const res = await send(envelope('v2.payment_intent.succeeded'), { prefix: 'webhook' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type: 'v2.payment_intent.succeeded' });
  });

  test('rejects an invalid signature sent with webhook-* headers', async () => {
    const res = await send(envelope('v2.payment_intent.succeeded'), { prefix: 'webhook', signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = envelope('deposit.confirmed');
    const msgId = 'msg_rotation';
    const timestamp = now();
    const signature = `v1,aW52YWxpZF9zaWduYXR1cmU= ${sign(payload, msgId, timestamp)}`;
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(200);
  });

  test('ignores signature versions other than v1', async () => {
    const payload = envelope('deposit.confirmed');
    const msgId = 'msg_v1a';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp).replace('v1,', 'v1a,');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a body that is not a JSON object', async () => {
    const res = await send('null');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSON');
  });

  test('rejects missing headers', async () => {
    const res = await request(app).post('/webhooks/nextpay').set('Content-Type', 'application/json').send('{}');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required webhook headers');
  });

  test('rejects an invalid signature', async () => {
    const res = await send(envelope('payout.succeeded'), { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = envelope('payout.succeeded');
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign(envelope('payout.failed'), msgId, timestamp);
    const res = await send(envelope('payout.succeeded'), { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send(envelope('payout.succeeded'), { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.NEXTPAY_WEBHOOK_SECRET;
    const res = await send(envelope('payout.succeeded'));
    expect(res.status).toBe(500);
  });

  test('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
