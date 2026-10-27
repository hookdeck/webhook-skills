const request = require('supertest');
const crypto = require('crypto');

// Checkout Page signing secrets are used as plain UTF-8 bytes
const secret = 'test_checkout_page_signing_secret';
process.env.CHECKOUT_PAGE_WEBHOOK_SECRET = secret;

const { app, verifyCheckoutPageWebhook } = require('../src/index');

/** Generate a Checkout Page signature: hex(HMAC-SHA256(secret, rawBody)). */
function digest(payload, key = secret) {
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}
const sign = (payload, key) => `sha256=${digest(payload, key)}`;

let counter = 0;
function makeEvent(event, data = {}) {
  counter += 1;
  return JSON.stringify({
    sellerId: 'seller_123',
    timestamp: '2026-01-01T00:00:00.000Z',
    eventId: `evt_${counter}`,
    event,
    data,
  });
}

function post(body, signature, contentType = 'application/json') {
  const req = request(app)
    .post('/webhooks/checkout-page')
    .set('Content-Type', contentType)
    .set('x-webhook-timestamp', '1767225600')
    .set('x-webhook-delivery-attempt', '1');
  if (signature !== undefined) req.set('x-webhook-signature', signature);
  return req.send(body);
}

describe('verifyCheckoutPageWebhook', () => {
  const body = makeEvent('payment.paid', { payment: { id: 'pay_1' } });
  const buf = Buffer.from(body);

  it('accepts sha256=<hex>', () => {
    expect(verifyCheckoutPageWebhook(buf, sign(body), secret)).toBe(true);
  });

  it('accepts the bare digest and uppercase hex', () => {
    expect(verifyCheckoutPageWebhook(buf, digest(body), secret)).toBe(true);
    expect(verifyCheckoutPageWebhook(buf, sign(body).toUpperCase().replace('SHA256=', 'sha256='), secret)).toBe(true);
  });

  it('rejects the wrong secret and tampered bodies', () => {
    expect(verifyCheckoutPageWebhook(buf, sign(body, 'wrong'), secret)).toBe(false);
    expect(verifyCheckoutPageWebhook(Buffer.from(body.replace('pay_1', 'pay_2')), sign(body), secret)).toBe(false);
  });

  it('rejects malformed values without decoding them', () => {
    const d = digest(body);
    expect(verifyCheckoutPageWebhook(buf, `sha256=${d.slice(0, 62)}`, secret)).toBe(false);
    expect(verifyCheckoutPageWebhook(buf, `sha256=${d}00`, secret)).toBe(false);
    expect(verifyCheckoutPageWebhook(buf, `sha256=${d.slice(0, 63)}z`, secret)).toBe(false);
    expect(verifyCheckoutPageWebhook(buf, `sha512=${d}`, secret)).toBe(false);
    expect(verifyCheckoutPageWebhook(buf, '', secret)).toBe(false);
    expect(verifyCheckoutPageWebhook(buf, undefined, secret)).toBe(false);
    expect(verifyCheckoutPageWebhook(buf, sign(body), undefined)).toBe(false);
  });
});

describe('POST /webhooks/checkout-page', () => {
  it('returns 401 when the signature header is missing', async () => {
    const res = await post(makeEvent('payment.paid'));
    expect(res.status).toBe(401);
    expect(res.text).toBe('Missing signature header');
  });

  it('returns 401 for an invalid signature', async () => {
    const res = await post(makeEvent('payment.paid'), `sha256=${'a'.repeat(64)}`);
    expect(res.status).toBe(401);
    expect(res.text).toBe('Invalid signature');
  });

  it('returns 401 for a malformed signature', async () => {
    const res = await post(makeEvent('payment.paid'), 'not-a-signature');
    expect(res.status).toBe(401);
  });

  it.each([
    ['payment.paid', { payment: { id: 'pay_1' } }],
    ['payment.created', {}],
    ['payment.abandoned', {}],
    ['booking.created', { booking: { id: 'bk_1' } }],
    ['booking.paid', {}],
    ['subscription.created', {}],
    ['subscription.canceled', {}],
    ['customer.created', {}],
    ['submission.created', {}],
    ['product.updated', {}],
  ])('returns 200 for a signed %s event', async (event, data) => {
    const body = makeEvent(event, data);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('dedupes retries on eventId', async () => {
    const body = makeEvent('payment.paid');
    const first = await post(body, sign(body));
    const second = await post(body, sign(body));
    expect(first.body).toEqual({ received: true });
    expect(second.body).toEqual({ received: true, duplicate: true });
  });

  it('verifies the exact bytes for non-JSON content types', async () => {
    const body = 'not json';
    const bad = await post(body, `sha256=${'a'.repeat(64)}`, 'text/plain');
    expect(bad.status).toBe(401);
    const good = await post(body, sign(body), 'text/plain');
    expect(good.status).toBe(400);
    expect(good.text).toBe('Invalid JSON');
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.CHECKOUT_PAGE_WEBHOOK_SECRET;
    try {
      const body = makeEvent('payment.paid');
      const res = await post(body, sign(body));
      expect(res.status).toBe(500);
    } finally {
      process.env.CHECKOUT_PAGE_WEBHOOK_SECRET = secret;
    }
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
