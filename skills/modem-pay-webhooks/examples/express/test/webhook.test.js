const request = require('supertest');
const crypto = require('crypto');

// Test-only secret. Modem Pay secrets are used as plain strings, exactly as the dashboard shows them.
const SECRET = 'test_modem_pay_webhook_secret_8f2c1d';
process.env.MODEM_PAY_WEBHOOK_SECRET = SECRET;

const { app, verifyModemPay } = require('../src/index');

// x-modem-signature = HMAC-SHA512 hex of the raw body (as Hookdeck's Modem Pay source checks it)
const sign = (body, secret = SECRET) => crypto.createHmac('sha512', secret).update(body).digest('hex');

function post(body, signature, contentType = 'application/json') {
  const req = request(app).post('/webhooks/modem-pay').set('Content-Type', contentType);
  if (signature !== undefined) req.set('x-modem-signature', signature);
  return req.send(body);
}

// Trimmed from the sample event on Modem Pay's webhooks page (customer details replaced)
const event = (name = 'charge.succeeded', payload = {}) =>
  JSON.stringify({
    event: name,
    payload: {
      id: '23419194-7324-4c2b-a74b-d8fba736e692',
      type: 'payment',
      amount: 2500,
      currency: 'GMD',
      payment_method: 'qmoney',
      status: 'completed',
      test_mode: true,
      transaction_reference: 'VOAO1CFEN7',
      ...payload,
    },
  });

let logSpy;
beforeEach(() => {
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
  process.env.MODEM_PAY_WEBHOOK_SECRET = SECRET;
});

describe('verifyModemPay', () => {
  const body = Buffer.from(event());

  it('accepts a valid signature', () => {
    expect(verifyModemPay(body, sign(body), SECRET)).toBe(true);
  });

  it('accepts uppercase hex', () => {
    expect(verifyModemPay(body, sign(body).toUpperCase(), SECRET)).toBe(true);
  });

  it('rejects a wrong secret', () => {
    expect(verifyModemPay(body, sign(body, 'other_secret'), SECRET)).toBe(false);
  });

  it('rejects a tampered body', () => {
    expect(verifyModemPay(Buffer.from(event('charge.succeeded', { amount: 1 })), sign(body), SECRET)).toBe(false);
  });

  it.each([
    ['empty', ''],
    ['short', sign(body).slice(0, 127)],
    ['long', sign(body) + '0'],
    ['non-hex', 'z'.repeat(128)],
    ['prefixed', `sha512=${sign(body)}`],
    ['sha256 length', 'a'.repeat(64)],
    ['non-ASCII', 'é'.repeat(128)],
  ])('rejects a %s signature without throwing', (_name, sig) => {
    expect(verifyModemPay(body, sig, SECRET)).toBe(false);
  });

  it('rejects when the header or secret is missing', () => {
    expect(verifyModemPay(body, undefined, SECRET)).toBe(false);
    expect(verifyModemPay(body, sign(body), '')).toBe(false);
  });
});

describe('POST /webhooks/modem-pay', () => {
  it('returns 200 for a valid charge.succeeded event', async () => {
    const body = event();
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Charge succeeded: 23419194'));
  });

  it.each([
    'charge.updated',
    'payment_intent.created',
    'customer.created',
    'transfer.succeeded',
    'transfer.failed',
  ])('handles %s', async (name) => {
    const body = event(name);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  it('acknowledges unknown events', async () => {
    const body = event('charge.expired');
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Unhandled Modem Pay event: charge.expired');
  });

  it('verifies the raw bytes, not re-serialised JSON', async () => {
    // Whitespace and key order a JSON round trip would change
    const body = '{ "payload": {"id": "x", "amount": 10},\n  "event": "charge.succeeded" }';
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  it('accepts any content type', async () => {
    const body = event();
    const res = await post(body, sign(body), 'text/plain');
    expect(res.status).toBe(200);
  });

  it('returns 401 when the signature header is missing', async () => {
    const res = await post(event());
    expect(res.status).toBe(401);
  });

  it('returns 401 for a tampered body', async () => {
    const body = event();
    const res = await post(event('charge.succeeded', { amount: 999999 }), sign(body));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a wrong secret', async () => {
    const body = event();
    const res = await post(body, sign(body, 'wrong_secret'));
    expect(res.status).toBe(401);
  });

  it('returns 400 for a signed non-JSON body', async () => {
    const body = 'not json';
    const res = await post(body, sign(body), 'text/plain');
    expect(res.status).toBe(400);
  });

  it.each([
    ['an array', '[]'],
    ['a string', '"charge.succeeded"'],
    ['null', 'null'],
    ['a numeric event', '{"event": 1, "payload": {}}'],
    ['a string payload', '{"event": "charge.succeeded", "payload": "x"}'],
    ['an array payload', '{"event": "charge.succeeded", "payload": []}'],
    ['no payload', '{"event": "charge.succeeded"}'],
  ])('returns 400 for a signed body that is %s', async (_name, body) => {
    const res = await post(body, sign(body));
    expect(res.status).toBe(400);
  });

  it('tolerates wrong-typed payload fields', async () => {
    const body = JSON.stringify({ event: 'charge.succeeded', payload: { id: 7, currency: [] } });
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.MODEM_PAY_WEBHOOK_SECRET;
    const body = event();
    const res = await post(body, sign(body));
    expect(res.status).toBe(500);
  });
});
