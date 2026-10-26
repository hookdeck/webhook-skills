const crypto = require('crypto');
const request = require('supertest');

// Treet issues the secret; it is used as UTF-8 bytes, not decoded.
const SECRET = 'treet_test_secret_key';
process.env.TREET_WEBHOOK_SECRET = SECRET;

const app = require('../src/index');
const { verifyTreetSignature } = app;

// base64(HMAC-SHA256(secret, raw body)), the whole header value
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('base64');
}

// Payload as shown in Treet's docs (shipping label payload)
const labelUpdated = {
  topic: 'label',
  trigger: 'label/updated',
  shopId: 'boyish',
  bundleId: '12345678-1234-1234-1234-123456789105',
  bundleType: 'TRADE_IN',
  carrier: 'USPS',
  trackingNumber: '28735625627856237856287',
  status: 'SHIPPED',
  updatedAt: '2024-01-01T12:00:00+00:00',
  items: [{ id: '11345678-1234-1234-1234-123456789101', sku: 'large-pink-shirt', title: 'Large Pink Shirt' }],
};
const BODY = JSON.stringify(labelUpdated);

describe('verifyTreetSignature', () => {
  it('accepts a valid signature', () => {
    expect(verifyTreetSignature(Buffer.from(BODY), sign(BODY))).toBe(true);
  });

  it('verifies the exact bytes (non-ASCII and extra whitespace)', () => {
    const body = Buffer.from('{ "title": "Café" }\n', 'utf8');
    expect(verifyTreetSignature(body, sign(body))).toBe(true);
    expect(verifyTreetSignature(Buffer.from('{"title":"Café"}'), sign(body))).toBe(false);
  });

  it('verifies an empty body', () => {
    expect(verifyTreetSignature(Buffer.alloc(0), sign(Buffer.alloc(0)))).toBe(true);
  });

  it('rejects a wrong secret, tampered body, missing and malformed signatures', () => {
    expect(verifyTreetSignature(Buffer.from(BODY), sign(BODY, 'other'))).toBe(false);
    expect(verifyTreetSignature(Buffer.from(BODY + ' '), sign(BODY))).toBe(false);
    expect(verifyTreetSignature(Buffer.from(BODY), undefined)).toBe(false);
    expect(verifyTreetSignature(Buffer.from(BODY), '')).toBe(false);
    expect(verifyTreetSignature(Buffer.from(BODY), 'sha256=' + sign(BODY))).toBe(false);
    expect(verifyTreetSignature(Buffer.from(BODY), sign(BODY).slice(0, -1))).toBe(false);
  });

  it('rejects a base64 value whose last character carries stray bits', () => {
    const sig = sign(BODY);
    // Same decoded bytes, different last character: the exact string must match.
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const last = alphabet.indexOf(sig[42]);
    const tweaked = sig.slice(0, 42) + alphabet[(last + 1) % 64] + '=';
    expect(Buffer.from(tweaked, 'base64').equals(Buffer.from(sig, 'base64'))).toBe(true);
    expect(verifyTreetSignature(Buffer.from(BODY), tweaked)).toBe(false);
  });

  it('never accepts when the secret is unset', () => {
    expect(verifyTreetSignature(Buffer.from(BODY), sign(BODY, ''), '')).toBe(false);
  });
});

describe('POST /webhooks/treet', () => {
  const post = (body, sig) => {
    const r = request(app).post('/webhooks/treet').set('Content-Type', 'application/json');
    if (sig !== undefined) r.set('X-Treet-Signature', sig);
    return r.send(body);
  };

  it('accepts label/updated and label/created', async () => {
    const created = JSON.stringify({ ...labelUpdated, trigger: 'label/created' });
    expect((await post(BODY, sign(BODY))).status).toBe(200);
    expect((await post(created, sign(created))).status).toBe(200);
  });

  it('logs and acknowledges an unknown trigger', async () => {
    const body = JSON.stringify({ topic: 'label', trigger: 'label/other' });
    expect((await post(body, sign(body))).status).toBe(200);
  });

  it('accepts any content type', async () => {
    const res = await request(app)
      .post('/webhooks/treet')
      .set('Content-Type', 'text/plain')
      .set('X-Treet-Signature', sign(BODY))
      .send(BODY);
    expect(res.status).toBe(200);
  });

  it('rejects a missing, malformed or wrong signature with 401', async () => {
    expect((await post(BODY)).status).toBe(401);
    expect((await post(BODY, '')).status).toBe(401);
    expect((await post(BODY, 'not-a-signature')).status).toBe(401);
    expect((await post(BODY, sign(BODY, 'other'))).status).toBe(401);
  });

  it('returns 400 for a validly signed non-JSON or non-object body', async () => {
    expect((await post('not json', sign('not json'))).status).toBe(400);
    expect((await post('[1]', sign('[1]'))).status).toBe(400);
  });

  it('tolerates wrong-typed fields', async () => {
    const body = JSON.stringify({ trigger: { x: 1 }, items: 'nope', bundleId: 5 });
    expect((await post(body, sign(body))).status).toBe(200);
  });
});

describe('other methods', () => {
  it('verifies a body-less GET over zero bytes and acknowledges it', async () => {
    const empty = Buffer.alloc(0);
    expect((await request(app).get('/webhooks/treet').set('X-Treet-Signature', sign(empty))).status).toBe(200);
    expect((await request(app).get('/webhooks/treet')).status).toBe(401);
  });

  it.each(['put', 'patch', 'delete'])('accepts a signed %s with a body', async (method) => {
    const res = await request(app)[method]('/webhooks/treet')
      .set('Content-Type', 'application/json')
      .set('X-Treet-Signature', sign(BODY))
      .send(BODY);
    expect(res.status).toBe(200);
  });
});
