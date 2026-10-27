const crypto = require('crypto');
const request = require('supertest');

process.env.KOMOJU_WEBHOOK_SECRET = 'komoju_test_secret_token';
const { app, verifyKomojuSignature } = require('../src/index');

const SECRET = process.env.KOMOJU_WEBHOOK_SECRET;

function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

// Envelopes follow the example deliveries in KOMOJU's webhook docs (ping, payment.authorized); the
// other events reuse the same envelope
const ping = JSON.stringify({
  "id": "do33foclbroj52ib9whb6yh4m",
  "type": "ping",
  "resource": "event",
  "data": {
    "id": "bll40gxhuhcw19vor5kx55akw",
    "resource": "webhook",
    "url": "http://example.com/hook",
    "active": true,
    "event_list": [
      "ping",
      "payment.captured"
    ],
    "created_at": "2018-11-13T06:19:49Z"
  },
  "created_at": "2018-11-13T06:19:49Z"
});
const authorized = JSON.stringify({
  "id": "dv7ywuavew3n2meqsllj5bbob",
  "type": "payment.authorized",
  "resource": "event",
  "data": {
    "id": "8xz5cn01gkt37cz0myd98k2f1",
    "resource": "payment",
    "status": "authorized",
    "amount": 1000,
    "tax": 80,
    "customer": null,
    "payment_deadline": "2018-11-20T14:59:59Z",
    "payment_details": {
      "type": "bank_transfer",
      "email": "test@example.com",
      "order_id": "Y5236584956"
    },
    "payment_method_fee": 0,
    "total": 1080,
    "currency": "JPY",
    "description": null,
    "captured_at": null,
    "external_order_num": "123",
    "metadata": {},
    "created_at": "2018-11-13T06:19:49Z",
    "amount_refunded": 0,
    "locale": "ja",
    "refunds": [],
    "refund_requests": []
  },
  "created_at": "2018-11-13T06:19:49Z"
});
const captured = JSON.stringify({
  "id": "cap0000000000000000000001",
  "type": "payment.captured",
  "resource": "event",
  "data": {
    "id": "8xz5cn01gkt37cz0myd98k2f1",
    "resource": "payment",
    "status": "captured",
    "amount": 1000,
    "tax": 80,
    "customer": null,
    "payment_deadline": "2018-11-20T14:59:59Z",
    "payment_details": {
      "type": "bank_transfer",
      "email": "test@example.com",
      "order_id": "Y5236584956"
    },
    "payment_method_fee": 0,
    "total": 1080,
    "currency": "JPY",
    "description": null,
    "captured_at": "2018-11-13T07:00:00Z",
    "external_order_num": "123",
    "metadata": {},
    "created_at": "2018-11-13T06:19:49Z",
    "amount_refunded": 0,
    "locale": "ja",
    "refunds": [],
    "refund_requests": []
  },
  "created_at": "2018-11-13T06:19:49Z"
});
const subscription = JSON.stringify({
  "id": "sub0000000000000000000001",
  "type": "subscription.created",
  "resource": "event",
  "data": {
    "id": "sub1",
    "resource": "subscription",
    "status": "active",
    "currency": "JPY",
    "amount": 1000
  },
  "created_at": "2018-11-13T06:19:49Z"
});
const unknown = JSON.stringify({
  "id": "set0000000000000000000001",
  "type": "settlement.created",
  "resource": "event",
  "data": {
    "id": "set1",
    "resource": "settlement"
  },
  "created_at": "2018-11-13T06:19:49Z"
});

function post(body, headers = {}) {
  return request(app).post('/webhooks/komoju').set('Content-Type', 'application/json').set(headers).send(body);
}

describe('verifyKomojuSignature', () => {
  it('accepts a valid signature, including uppercase hex', () => {
    expect(verifyKomojuSignature(Buffer.from(authorized), sign(authorized), SECRET)).toBe(true);
    expect(verifyKomojuSignature(Buffer.from(authorized), sign(authorized).toUpperCase(), SECRET)).toBe(true);
  });
  it('verifies non-ASCII bytes exactly as received', () => {
    const body = Buffer.from('{"name":"株式会社DEGICA"}', 'utf8');
    expect(verifyKomojuSignature(body, sign(body), SECRET)).toBe(true);
  });
  it('rejects wrong secret, prefix, missing header, bad hex, wrong length', () => {
    expect(verifyKomojuSignature(Buffer.from(authorized), sign(authorized, 'other'), SECRET)).toBe(false);
    expect(verifyKomojuSignature(Buffer.from(authorized), 'sha256=' + sign(authorized), SECRET)).toBe(false);
    expect(verifyKomojuSignature(Buffer.from(authorized), undefined, SECRET)).toBe(false);
    expect(verifyKomojuSignature(Buffer.from(authorized), '', SECRET)).toBe(false);
    expect(verifyKomojuSignature(Buffer.from(authorized), 'zz'.repeat(32), SECRET)).toBe(false);
    expect(verifyKomojuSignature(Buffer.from(authorized), 'abcd', SECRET)).toBe(false);
  });
});

describe('POST /webhooks/komoju', () => {
  it.each([
    ['ping', ping],
    ['payment.authorized', authorized],
    ['payment.captured', captured],
    ['subscription.created', subscription],
    ['an unhandled event', unknown],
  ])('accepts a signed %s event', async (_n, body) => {
    const res = await post(body, { 'x-komoju-signature': sign(body) });
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });

  it('verifies any content type over the raw bytes', async () => {
    const res = await request(app)
      .post('/webhooks/komoju')
      .set('Content-Type', 'text/plain')
      .set('x-komoju-signature', sign(captured))
      .send(captured);
    expect(res.status).toBe(200);
  });

  it('flags a repeated event id as a duplicate', async () => {
    const body = JSON.stringify({ id: 'dup-1', type: 'payment.updated', resource: 'event', data: {} });
    const first = await post(body, { 'x-komoju-signature': sign(body) });
    const second = await post(body, { 'x-komoju-signature': sign(body) });
    expect(first.body).toEqual({ received: true });
    expect(second.body).toEqual({ received: true, duplicate: true });
  });

  it('rejects an unsigned request with 401', async () => {
    expect((await post(authorized)).status).toBe(401);
  });

  it('rejects a bad signature with 401', async () => {
    expect((await post(authorized, { 'x-komoju-signature': sign(authorized, 'wrong') })).status).toBe(401);
  });

  it('rejects a malformed signature with 401', async () => {
    expect((await post(authorized, { 'x-komoju-signature': 'abc' })).status).toBe(401);
  });

  it('rejects a tampered body with 401', async () => {
    const res = await post(authorized.replace('1000', '9000'), { 'x-komoju-signature': sign(authorized) });
    expect(res.status).toBe(401);
  });

  it('returns 400 for a signed but malformed JSON body', async () => {
    const bad = '{not json';
    expect((await post(bad, { 'x-komoju-signature': sign(bad) })).status).toBe(400);
  });

  it.each(['null', '42', '[1,2]'])('returns 400 for a signed non-object body %s', async (body) => {
    expect((await post(body, { 'x-komoju-signature': sign(body) })).status).toBe(400);
  });
});
