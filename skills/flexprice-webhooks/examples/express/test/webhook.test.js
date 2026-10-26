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

// prefix: 'svix' (Flexprice Cloud) or 'webhook' (Standard Webhooks names for the same values)
function send(payload, { msgId = `msg_${crypto.randomBytes(12).toString('hex')}`, timestamp = now(), signature, contentType = 'application/json', prefix = 'svix' } = {}) {
  return request(app)
    .post('/webhooks/flexprice')
    .set('Content-Type', contentType)
    .set(`${prefix}-id`, msgId)
    .set(`${prefix}-timestamp`, timestamp)
    .set(`${prefix}-signature`, signature ?? sign(payload, msgId, timestamp))
    .send(payload);
}

const events = {
  'customer.created': { customer: { id: 'cust_01J', external_id: 'acme' } },
  'customer.updated': { customer: { id: 'cust_01J', external_id: 'acme' } },
  'customer.deleted': { customer: { id: 'cust_01J' } },
  'subscription.created': { subscription: { id: 'sub_01J', customer_id: 'cust_01J' } },
  'subscription.activated': { subscription: { id: 'sub_01J', subscription_status: 'active' } },
  'subscription.updated': { subscription: { id: 'sub_01J' } },
  'subscription.plan_changed': { subscription: { id: 'sub_01J', plan_id: 'plan_02' } },
  'subscription.cancelled': { subscription: { id: 'sub_01J' } },
  'invoice.update.finalized': { invoice: { id: 'inv_01J', invoice_status: 'FINALIZED', payment_status: 'PENDING', currency: 'USD', amount_due: '149.00' } },
  'invoice.update.payment': { invoice: { id: 'inv_01J', payment_status: 'SUCCEEDED' } },
  'invoice.update.voided': { invoice: { id: 'inv_01J', invoice_status: 'VOIDED' } },
  'invoice.payment.overdue': { invoice: { id: 'inv_01J' } },
  'payment.success': { payment: { id: 'pay_01J', amount: '149.00' } },
  'payment.failed': { payment: { id: 'pay_01J' } },
  'wallet.credit_balance.dropped': { wallet: { id: 'wallet_01J', credit_balance: '5.00' } },
  'checkout.session.completed': { checkout_session: { id: 'cs_01J' } },
  'event.rejected': { event: { event_name: 'api_call' } },
};

describe('Flexprice webhook handler', () => {
  beforeEach(() => {
    process.env.FLEXPRICE_WEBHOOK_SECRET = TEST_SECRET;
  });

  test.each(Object.entries(events))('handles %s', async (type, data) => {
    const res = await send(JSON.stringify({ event_type: type, ...data }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type });
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(JSON.stringify({ event_type: 'flexprice.something.new' }));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('flexprice.something.new');
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(JSON.stringify({ event_type: 'payment.success', payment: { id: 'pay_01J' } }), {
      contentType: 'application/octet-stream',
    });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed the same way but sent with webhook-* headers', async () => {
    const res = await send(JSON.stringify({ event_type: 'payment.success', payment: { id: 'pay_01J' } }), { prefix: 'webhook' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type: 'payment.success' });
  });

  test('rejects an invalid signature sent with webhook-* headers', async () => {
    const res = await send('{"event_type":"payment.success"}', { prefix: 'webhook', signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = JSON.stringify({ event_type: 'invoice.update.finalized' });
    const msgId = 'msg_rotation';
    const timestamp = now();
    const signature = `v1,aW52YWxpZF9zaWduYXR1cmU= ${sign(payload, msgId, timestamp)}`;
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(200);
  });

  test('rejects missing headers', async () => {
    const res = await request(app).post('/webhooks/flexprice').set('Content-Type', 'application/json').send('{}');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required webhook headers');
  });

  test('rejects an unsigned delivery (self-hosted Flexprice without Svix)', async () => {
    const res = await request(app).post('/webhooks/flexprice').set('Content-Type', 'application/json').send('{"event_type":"customer.created"}');
    expect(res.status).toBe(400);
  });

  test('rejects an invalid signature', async () => {
    const res = await send('{"event_type":"invoice.update.finalized"}', { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = '{"event_type":"invoice.update.finalized"}';
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign('{"event_type":"payment.failed"}', msgId, timestamp);
    const res = await send('{"event_type":"payment.success"}', { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send('{"event_type":"invoice.update.finalized"}', { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.FLEXPRICE_WEBHOOK_SECRET;
    const res = await send('{"event_type":"invoice.update.finalized"}');
    expect(res.status).toBe(500);
  });

  test('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
