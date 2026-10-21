const crypto = require('crypto');
const request = require('supertest');

// Lemon Squeezy signing secrets are arbitrary 6-40 character strings (used as-is, not decoded)
const SECRET = 'test_signing_secret';
process.env.LEMON_SQUEEZY_SIGNING_SECRET = SECRET;

const app = require('../src/index');

function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function payload(eventName, type = 'orders', attributes = {}) {
  return JSON.stringify({
    meta: { event_name: eventName, custom_data: { user_id: '42' } },
    data: { type, id: '1', attributes: { total_formatted: '$11.99', status: 'active', ends_at: null, ...attributes } },
  });
}

function send(body, headers = {}) {
  return request(app)
    .post('/webhooks/lemon-squeezy')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(body);
}

describe('Lemon Squeezy webhook', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  const events = [
    'order_created',
    'order_refunded',
    'subscription_created',
    'subscription_updated',
    'subscription_cancelled',
    'subscription_payment_success',
    'license_key_created',
  ];

  test.each(events)('accepts a validly signed %s event', async (eventName) => {
    const body = payload(eventName);
    const res = await send(body, { 'X-Event-Name': eventName, 'X-Signature': sign(body) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  test('falls back to meta.event_name when X-Event-Name is absent', async () => {
    const body = payload('order_created');
    const res = await send(body, { 'X-Signature': sign(body) });
    expect(res.status).toBe(200);
  });

  test('accepts unhandled event types', async () => {
    const body = payload('customer_updated', 'customers');
    const res = await send(body, { 'X-Event-Name': 'customer_updated', 'X-Signature': sign(body) });
    expect(res.status).toBe(200);
  });

  test('rejects a missing signature', async () => {
    const res = await send(payload('order_created'), { 'X-Event-Name': 'order_created' });
    expect(res.status).toBe(400);
  });

  test('rejects an invalid signature', async () => {
    const body = payload('order_created');
    const res = await send(body, { 'X-Event-Name': 'order_created', 'X-Signature': 'deadbeef' });
    expect(res.status).toBe(400);
  });

  test('rejects a signature made with the wrong secret', async () => {
    const body = payload('order_created');
    const res = await send(body, { 'X-Event-Name': 'order_created', 'X-Signature': sign(body, 'other_secret') });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const body = payload('order_created');
    const sig = sign(body);
    const res = await send(body.replace('11.99', '0.01'), { 'X-Event-Name': 'order_created', 'X-Signature': sig });
    expect(res.status).toBe(400);
  });

  test('rejects invalid JSON even when correctly signed', async () => {
    const body = 'not json';
    const res = await send(body, { 'X-Signature': sign(body) });
    expect(res.status).toBe(400);
  });
});
