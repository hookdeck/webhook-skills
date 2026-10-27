const request = require('supertest');
const crypto = require('crypto');

const SECRET = 'test_ziina_secret';
process.env.ZIINA_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

// Based on the payload shown in Ziina's docs.
const paymentIntent = {
  event: 'payment_intent.status.updated',
  data: {
    id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    account_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    amount: 1050,
    tip_amount: 0,
    vat_amount: 0,
    currency_code: 'AED',
    created_at: '1712345678901',
    status: 'completed',
    operation_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    settled: { amount: 1050, tip_amount: 0, vat_amount: 0, currency_code: 'AED' },
    card_details: { card_last_four: '6789', card_brand: 'mastercard', card_funding_type: 'credit' },
  },
};
const refund = { event: 'refund.status.updated', data: { id: 'r-1', status: 'completed' } };

// Ziina: lowercase hex HMAC-SHA256 of the raw body, no prefix.
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function post(body, headers = {}) {
  return request(app)
    .post('/webhooks/ziina')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(body);
}

describe('Ziina webhook', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('accepts a valid signature (payment intent)', async () => {
    const body = JSON.stringify(paymentIntent);
    const res = await post(body, { 'X-Hmac-Signature': sign(body) });
    expect(res.status).toBe(200);
  });

  it('accepts a valid signature (refund)', async () => {
    const body = JSON.stringify(refund);
    const res = await post(body, { 'X-Hmac-Signature': sign(body) });
    expect(res.status).toBe(200);
  });

  it('accepts an uppercase hex signature', async () => {
    const body = JSON.stringify(paymentIntent);
    const res = await post(body, { 'X-Hmac-Signature': sign(body).toUpperCase() });
    expect(res.status).toBe(200);
  });

  it('verifies the exact bytes, not re-serialised JSON', async () => {
    const body = '{ "event" : "refund.status.updated",\n  "data": {"id":"r-2","status":"completed"} }';
    const res = await post(body, { 'X-Hmac-Signature': sign(body) });
    expect(res.status).toBe(200);
  });

  it('accepts an unrecognised event type', async () => {
    const body = JSON.stringify({ event: 'something.else', data: {} });
    const res = await post(body, { 'X-Hmac-Signature': sign(body) });
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature', async () => {
    const res = await post(JSON.stringify(paymentIntent));
    expect(res.status).toBe(401);
  });

  it('rejects an empty signature', async () => {
    const res = await post(JSON.stringify(paymentIntent), { 'X-Hmac-Signature': '' });
    expect(res.status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = JSON.stringify(paymentIntent);
    const res = await post(body, { 'X-Hmac-Signature': sign(body, 'other_secret') });
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(paymentIntent);
    const sig = sign(body);
    const res = await post(body.replace('1050', '9999'), { 'X-Hmac-Signature': sig });
    expect(res.status).toBe(401);
  });

  it('rejects a prefixed or malformed signature', async () => {
    const body = JSON.stringify(paymentIntent);
    const sig = sign(body);
    for (const bad of [`sha256=${sig}`, sig.slice(0, 62), `${sig}00`, `zz${sig.slice(2)}`]) {
      const res = await post(body, { 'X-Hmac-Signature': bad });
      expect(res.status).toBe(401);
    }
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await post(body, { 'X-Hmac-Signature': sign(body) });
    expect(res.status).toBe(400);
  });
});
