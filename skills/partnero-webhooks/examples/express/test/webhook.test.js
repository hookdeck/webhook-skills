const request = require('supertest');
const crypto = require('crypto');

const SECRET = 'partnero_test_signing_secret';
process.env.PARTNERO_WEBHOOK_SECRET = SECRET;

const { app, verifyPartneroSignature } = require('../src/index');

function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

// Shape from Partnero's documented partner.created payload
const partnerCreated = JSON.stringify({
  event: 'partner.created',
  url: 'https://your-server.com/webhooks/partnero',
  webhook_key: 'wh_abc123',
  created_at: '2025-01-15T10:30:00.000000Z',
  data: {
    id: 'partner_abc123',
    email: 'partner@partnero.com',
    name: 'John',
    surname: 'Doe',
    status: 'approved',
    created_at: '2025-01-15T10:30:00.000000Z',
    metadata: {},
  },
});

// PHP's json_encode escapes slashes and non-ASCII; the signature covers these exact bytes
const phpEncoded =
  '{"event":"transaction.created","url":"https:\\/\\/your-server.com\\/webhooks\\/partnero",' +
  '"webhook_key":"wh_abc123","created_at":"2025-01-15T14:22:00.000000Z",' +
  '"data":{"key":"txn_123","amount":99.99,"currency":"USD","action":"sale","note":"caf\\u00e9"}}';

const post = (body, headers = {}) =>
  request(app)
    .post('/webhooks/partnero')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(body);

describe('verifyPartneroSignature', () => {
  it('accepts a valid signature', () => {
    const raw = Buffer.from(partnerCreated);
    expect(verifyPartneroSignature(raw, sign(raw), SECRET)).toBe(true);
  });

  it('accepts uppercase hex', () => {
    const raw = Buffer.from(partnerCreated);
    expect(verifyPartneroSignature(raw, sign(raw).toUpperCase(), SECRET)).toBe(true);
  });

  it('rejects wrong secret, missing, empty, short, long and non-hex values', () => {
    const raw = Buffer.from(partnerCreated);
    expect(verifyPartneroSignature(raw, sign(raw, 'other'), SECRET)).toBe(false);
    expect(verifyPartneroSignature(raw, undefined, SECRET)).toBe(false);
    expect(verifyPartneroSignature(raw, '', SECRET)).toBe(false);
    expect(verifyPartneroSignature(raw, 'abcd', SECRET)).toBe(false);
    expect(verifyPartneroSignature(raw, sign(raw) + '00', SECRET)).toBe(false);
    expect(verifyPartneroSignature(raw, 'zz'.repeat(32), SECRET)).toBe(false);
    expect(verifyPartneroSignature(raw, 'sha256=' + sign(raw), SECRET)).toBe(false);
  });
});

describe('POST /webhooks/partnero', () => {
  it('accepts a signed partner.created event', async () => {
    const res = await post(partnerCreated, { Signature: sign(partnerCreated) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('verifies the exact bytes (escaped slashes and unicode)', async () => {
    const ok = await post(phpEncoded, { Signature: sign(phpEncoded) });
    expect(ok.status).toBe(200);
    // A signature over the re-serialised JSON must not verify
    const reserialised = JSON.stringify(JSON.parse(phpEncoded));
    const bad = await post(phpEncoded, { Signature: sign(reserialised) });
    expect(bad.status).toBe(401);
  });

  it('accepts any content type', async () => {
    const res = await request(app)
      .post('/webhooks/partnero')
      .set('Content-Type', 'text/plain')
      .set('Signature', sign(partnerCreated))
      .send(partnerCreated);
    expect(res.status).toBe(200);
  });

  it('logs unknown events and returns 200', async () => {
    const body = JSON.stringify({ event: 'customer.updated', data: { id: 'cust_1' } });
    const res = await post(body, { Signature: sign(body) });
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature', async () => {
    expect((await post(partnerCreated)).status).toBe(401);
  });

  it('rejects an invalid signature', async () => {
    expect((await post(partnerCreated, { Signature: 'a'.repeat(64) })).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const res = await post(partnerCreated.replace('John', 'Jane'), { Signature: sign(partnerCreated) });
    expect(res.status).toBe(401);
  });

  it('returns 400 for a signed non-JSON body', async () => {
    const body = 'not json';
    const res = await post(body, { Signature: sign(body) });
    expect(res.status).toBe(400);
  });
});
