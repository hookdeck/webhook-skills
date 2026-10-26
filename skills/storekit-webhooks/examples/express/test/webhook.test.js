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

// prefix: 'svix' (Storekit as documented) or 'webhook' (Standard Webhooks names for the same values)
function send(payload, { msgId = `msg_${crypto.randomBytes(12).toString('hex')}`, timestamp = now(), signature, contentType = 'application/json', prefix = 'svix' } = {}) {
  return request(app)
    .post('/webhooks/storekit')
    .set('Content-Type', contentType)
    .set(`${prefix}-id`, msgId)
    .set(`${prefix}-timestamp`, timestamp)
    .set(`${prefix}-signature`, signature ?? sign(payload, msgId, timestamp))
    .send(payload);
}

const venue = { id: 1234, name: 'My Restaurant', slug: 'my-restaurant' };
const order = { id: 'ord_abc123', code: 'A1B2', total: 2500, orderType: 'Pickup', items: [{ name: 'Margherita Pizza', price: 1200, quantity: 1 }], venue };

// Standard {event, data} envelope
function envelope(type, data = {}) {
  return JSON.stringify({ event: type, data });
}

// order.refund.* put order/customer/venue/refund beside `event`
function refundEnvelope(type) {
  return JSON.stringify({
    event: type,
    order: { id: 'ord_abc123', total: 2500 },
    customer: { id: null, name: 'John Doe', email: 'john@example.com' },
    venue,
    refund: { status: 'pending', amount: 1000, totalAmountRefunded: 1000, reason: null },
  });
}

const statusData = (status) => ({ order: { id: 'ord_abc123', code: 'A1B2', status }, venue });
const linkData = { paymentLink: { id: 'plink_019dbc4d', title: 'Invoice #001', reference: 'INV-001' }, venue };
const printerData = { printer: { id: '6041b7c2', name: 'Kitchen Printer' }, venue };

// All 27 documented events, each with a payload shaped like the docs
const EVENTS = {
  'order.created.v2': envelope('order.created.v2', order),
  'order.created': JSON.stringify(order), // legacy: bare order object, no `event`
  'order.accepted': envelope('order.accepted', { ...order, status: 'accepted', acceptedAt: '2024-01-15T10:31:00Z' }),
  'order.rejected': envelope('order.rejected', { ...order, status: 'rejected', rejectedAt: '2024-01-15T10:31:00Z' }),
  'order.canceled': envelope('order.canceled', statusData('canceled')),
  'order.preparing': envelope('order.preparing', statusData('preparing')),
  'order.ready_for_pickup': envelope('order.ready_for_pickup', statusData('ready_for_pickup')),
  'order.out_for_delivery': envelope('order.out_for_delivery', statusData('out_for_delivery')),
  'order.pos.dispatch.failed': envelope('order.pos.dispatch.failed', { order: { id: 'ord_abc123', code: 'A1B2', total: 2500 }, venue, pos: { name: 'Zonal', error: 'Connection timeout' }, retryCount: 3 }),
  'order.rating.updated': envelope('order.rating.updated', { order: { id: 'ord_abc123', code: 'A1B2' }, rating: 5, comments: 'Great food', venue }),
  'order.completed': envelope('order.completed', statusData('completed')),
  'order.refund.created': refundEnvelope('order.refund.created'),
  'order.refund.succeeded': refundEnvelope('order.refund.succeeded'),
  'order.refund.failed': refundEnvelope('order.refund.failed'),
  'store.opened': envelope('store.opened', { venue }),
  'store.closed': envelope('store.closed', { closedReason: '', closedUntil: '', venue }),
  'store.opening_hours.updated': envelope('store.opening_hours.updated', { venue, openingHours: [{ day: 'monday', openTime: '09:00:00', closeTime: '22:00:00', active: true }], specialHours: [], source: 'dashboard' }),
  'item.out_of_stock': envelope('item.out_of_stock', { venue, item: { id: 5678, name: 'Margherita Pizza' }, reason: 'snoozed', source: 'manual', details: { snoozeEnd: null } }),
  'payments.payout.created': envelope('payments.payout.created', { amounts: [{ currency: 'GBP', value: '3210.50' }], estimatedArrivalDate: '1/2024' }),
  'bill.payment.created': envelope('bill.payment.created', {}),
  'payment_link.created': envelope('payment_link.created', { paymentLink: { id: 'plink_019dbc4d', type: 'one_off', amountType: 'fixed', amount: 2500, currency: 'GBP' }, venue }),
  'payment_link.paid': envelope('payment_link.paid', { ...linkData, payment: { transactionId: 'txn_abc123', amount: 2500, currency: 'GBP', pspReference: 'ABCD1234' } }),
  'payment_link.refund.created': envelope('payment_link.refund.created', { ...linkData, refund: { id: 'ref_xyz789', transactionId: 'txn_abc123', amount: 1000, currency: 'GBP' } }),
  'payment_link.refund.succeeded': envelope('payment_link.refund.succeeded', { ...linkData, refund: { id: 'ref_xyz789', transactionId: 'txn_abc123', amount: 1000, currency: 'GBP' } }),
  'payment_link.refund.failed': envelope('payment_link.refund.failed', { ...linkData, refund: { id: 'ref_xyz789', transactionId: 'txn_abc123', amount: 1000, currency: 'GBP' } }),
  'printer.status.offline': envelope('printer.status.offline', printerData),
  'printer.status.online': envelope('printer.status.online', printerData),
};

describe('Storekit webhook handler', () => {
  beforeEach(() => {
    process.env.STOREKIT_WEBHOOK_SECRET = TEST_SECRET;
  });

  test('covers the 27 documented events', () => {
    expect(Object.keys(EVENTS)).toHaveLength(27);
  });

  test.each(Object.entries(EVENTS))('handles %s', async (type, payload) => {
    const res = await send(payload);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type });
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(envelope('storekit.something.new'));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('storekit.something.new');
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(EVENTS['store.opened'], { contentType: 'application/octet-stream' });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed the same way but sent with webhook-* headers', async () => {
    const res = await send(EVENTS['order.created.v2'], { prefix: 'webhook' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type: 'order.created.v2' });
  });

  test('rejects an invalid signature sent with webhook-* headers', async () => {
    const res = await send(EVENTS['order.created.v2'], { prefix: 'webhook', signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = EVENTS['order.completed'];
    const msgId = 'msg_rotation';
    const timestamp = now();
    const signature = `v1,aW52YWxpZF9zaWduYXR1cmU= ${sign(payload, msgId, timestamp)}`;
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(200);
  });

  test('ignores signature versions other than v1', async () => {
    const payload = EVENTS['order.completed'];
    const msgId = 'msg_v1a';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp).replace('v1,', 'v1a,');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects missing headers', async () => {
    const res = await request(app).post('/webhooks/storekit').set('Content-Type', 'application/json').send('{}');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required webhook headers');
  });

  test('rejects an invalid signature', async () => {
    const res = await send(EVENTS['order.created.v2'], { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = EVENTS['order.created.v2'];
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign(EVENTS['order.canceled'], msgId, timestamp);
    const res = await send(EVENTS['order.completed'], { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send(EVENTS['order.created.v2'], { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Timestamp too old');
  });

  test('rejects a validly signed body that is not a JSON object', async () => {
    const res = await send('[1,2,3]');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSON');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.STOREKIT_WEBHOOK_SECRET;
    const res = await send(EVENTS['order.created.v2']);
    expect(res.status).toBe(500);
  });

  test('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
