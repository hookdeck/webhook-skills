const request = require('supertest');
const crypto = require('crypto');

// SendX signs with the team API key (any string, used as UTF-8 bytes as-is)
const SECRET = 'sendx_team_api_key_for_tests';
process.env.SENDX_WEBHOOK_SECRET = SECRET;

const { app, verifySendxSignature, getEventType } = require('../src/index');

function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function post(body, headers = {}) {
  const req = request(app).post('/webhooks/sendx').set('Content-Type', 'application/json');
  Object.entries(headers).forEach(([k, v]) => req.set(k, v));
  return req.send(body);
}

const body = JSON.stringify({ type: 7, email: 'jane@example.com' });

describe('SendX webhook', () => {
  let errorSpy;
  let logSpy;
  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('accepts a valid signature', async () => {
    const res = await post(body, { 'X-SendX-Signature': sign(body), 'X-SendX-Signature-Alg': 'hmac-sha256' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('MailOpen (type 7)'));
  });

  it('accepts an uppercase hex signature', async () => {
    const res = await post(body, { 'X-SendX-Signature': sign(body).toUpperCase() });
    expect(res.status).toBe(200);
  });

  it('verifies any content type over the raw bytes', async () => {
    const res = await request(app)
      .post('/webhooks/sendx')
      .set('Content-Type', 'text/plain')
      .set('X-SendX-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('verifies exact bytes, including odd whitespace', async () => {
    const spaced = '{ "type" : 8 ,\n "email":"a@example.com" }';
    const res = await post(spaced, { 'X-SendX-Signature': sign(spaced) });
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature', async () => {
    expect((await post(body)).status).toBe(401);
  });

  it('rejects an empty signature', async () => {
    expect((await post(body, { 'X-SendX-Signature': '' })).status).toBe(401);
  });

  it('rejects a wrong secret', async () => {
    expect((await post(body, { 'X-SendX-Signature': sign(body, 'other_key') })).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const res = await post(body.replace('jane', 'mallory'), { 'X-SendX-Signature': sign(body) });
    expect(res.status).toBe(401);
  });

  it.each([
    ['too short', 'abcd'],
    ['too long', 'a'.repeat(66)],
    ['non-hex characters', 'z'.repeat(64)],
    ['prefixed', `sha256=${'a'.repeat(64)}`],
  ])('rejects a malformed signature (%s)', async (_label, sig) => {
    expect((await post(body, { 'X-SendX-Signature': sig })).status).toBe(401);
  });

  it('answers 400 for a signed non-JSON body', async () => {
    const bad = 'not json';
    expect((await post(bad, { 'X-SendX-Signature': sign(bad) })).status).toBe(400);
  });

  it.each(['null', '42', '[1,2]', '"text"'])('answers 400 for a signed non-object body %s', async (raw) => {
    expect((await post(raw, { 'X-SendX-Signature': sign(raw) })).status).toBe(400);
  });

  it.each([
    ['missing type', { email: 'a@example.com' }],
    ['string type', { type: 'open' }],
    ['object type', { type: { a: 1 } }],
    ['null type', { type: null }],
    ['fractional type', { type: 7.5 }],
  ])('ignores a wrong-typed event (%s) without erroring', async (_label, payload) => {
    const raw = JSON.stringify(payload);
    const res = await post(raw, { 'X-SendX-Signature': sign(raw) });
    expect(res.status).toBe(200);
  });

  it('answers 500 when the secret is not configured', async () => {
    delete process.env.SENDX_WEBHOOK_SECRET;
    try {
      expect((await post(body, { 'X-SendX-Signature': sign(body) })).status).toBe(500);
    } finally {
      process.env.SENDX_WEBHOOK_SECRET = SECRET;
    }
  });
});

describe('verifySendxSignature', () => {
  it('takes bytes and compares the whole header value', () => {
    const raw = Buffer.from(body);
    expect(verifySendxSignature(raw, sign(body), SECRET)).toBe(true);
    expect(verifySendxSignature(raw, undefined, SECRET)).toBe(false);
    expect(verifySendxSignature(raw, [sign(body)], SECRET)).toBe(false);
  });
});

describe('getEventType', () => {
  it('compares event codes as numbers', () => {
    expect(getEventType({ type: 7 })).toBe(7);
    expect(getEventType({ type: '8' })).toBe(8);
    expect(getEventType({ type: 'x' })).toBeNull();
    expect(getEventType(null)).toBeNull();
    expect(getEventType([7])).toBeNull();
  });
});
