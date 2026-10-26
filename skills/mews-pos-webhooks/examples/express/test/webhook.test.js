const crypto = require('crypto');
const request = require('supertest');

const SECRET = 'test_mews_pos_secret_key';
process.env.MEWS_POS_WEBHOOK_SECRET = SECRET;

const app = require('../src/index');
const { verifyMewsPosSignature } = require('../src/index');

// The documented sample (booking.status.updated) plus the same shape for the other events
function event(eventType, type, attributes = {}) {
  return {
    data: { id: '98656c4a-950d-4b19-b7ef-ad1744e92b53', type, attributes },
    meta: { eventType },
  };
}
const booking = event('booking.status.updated', 'bookings', {
  status: 'seated',
  updatedAt: '2025-02-06T09:41:30.465Z',
});
const orderStatus = event('order.status.updated', 'orders', { status: 'Open' });
const orderPayment = event('order.payments.added', 'orders', { amount: 12.5 });
const productAvailability = event('product.availability.updated', 'products', { available: false });

// Same algorithm as Mews: Base64.strict_encode64(HMAC-SHA256(secret, body))
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('base64');
}

// Same bytes, different Base64 string: flip the low bit of the final character's data bits
function nonCanonical(signature) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const last = signature[42];
  return signature.slice(0, 42) + alphabet[alphabet.indexOf(last) ^ 1] + '=';
}

function post(body, headers = {}, contentType = 'application/json') {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  return request(app)
    .post('/webhooks/mews-pos')
    .set('Content-Type', contentType)
    .set(headers)
    .send(payload);
}

function signedPost(body, contentType) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  return post(payload, { 'X-Signature': sign(payload) }, contentType);
}

describe('Mews POS webhook', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('accepts a validly signed booking.status.updated event', async () => {
    const res = await signedPost(booking);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('status: seated'));
  });

  it.each([orderStatus, orderPayment, productAvailability])(
    'accepts $meta.eventType',
    async (evt) => {
      expect((await signedPost(evt)).status).toBe(200);
    }
  );

  it('verifies the exact bytes whatever the content type', async () => {
    expect((await signedPost(booking, 'text/plain')).status).toBe(200);
  });

  it('logs and accepts unknown events', async () => {
    const res = await signedPost(event('order.something.new', 'orders'));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith('Unhandled Mews POS event: order.something.new');
  });

  it('rejects a missing X-Signature', async () => {
    expect((await post(booking)).status).toBe(401);
  });

  it('rejects an empty X-Signature', async () => {
    expect((await post(booking, { 'X-Signature': '' })).status).toBe(401);
  });

  it('rejects a signature that does not match', async () => {
    const payload = JSON.stringify(booking);
    expect((await post(payload, { 'X-Signature': sign(payload, 'wrong-secret') })).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const signature = sign(JSON.stringify(booking));
    const tampered = JSON.stringify(event('booking.status.updated', 'bookings', { status: 'left' }));
    expect((await post(tampered, { 'X-Signature': signature })).status).toBe(401);
  });

  it('rejects a signature over re-serialised JSON', async () => {
    const pretty = JSON.stringify(booking, null, 2);
    expect((await post(pretty, { 'X-Signature': sign(JSON.stringify(booking)) })).status).toBe(401);
  });

  it('rejects malformed signatures without decoding them', async () => {
    const payload = JSON.stringify(booking);
    const good = sign(payload);
    for (const bad of [good.slice(0, 43), good + 'A', good.replace(/=$/, ''), good.toLowerCase(), `sha256=${good}`, good.slice(0, 20) + "-" + good.slice(21)]) {
      expect((await post(payload, { 'X-Signature': bad })).status).toBe(401);
    }
  });

  it('rejects a non-canonical Base64 encoding of the same digest', async () => {
    const payload = JSON.stringify(booking);
    const good = sign(payload);
    const bad = nonCanonical(good);
    expect(Buffer.from(bad, 'base64').equals(Buffer.from(good, 'base64'))).toBe(true);
    expect((await post(payload, { 'X-Signature': bad })).status).toBe(401);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    expect((await signedPost('not json')).status).toBe(400);
  });

  it.each([
    ['an array', '[]'],
    ['a string', '"hello"'],
    ['a missing meta', JSON.stringify({ data: booking.data })],
    ['a non-object meta', JSON.stringify({ data: booking.data, meta: 'x' })],
    ['a non-string eventType', JSON.stringify({ data: booking.data, meta: { eventType: 5 } })],
  ])('returns 400 for %s', async (_name, body) => {
    expect((await signedPost(body)).status).toBe(400);
  });

  it('ignores wrong-typed data fields instead of failing', async () => {
    for (const data of ['x', null, [], { id: 5, attributes: 'y' }]) {
      const res = await signedPost({ data, meta: { eventType: 'booking.status.updated' } });
      expect(res.status).toBe(200);
    }
  });

  it('fails closed when the secret is not configured', () => {
    const body = Buffer.from(JSON.stringify(booking));
    expect(verifyMewsPosSignature(body, sign(body), '')).toBe(false);
  });
});
