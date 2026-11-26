// Generated with: outseta-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Synthetic Webhook Signature Key: 32 bytes as hex, like the output of openssl rand -hex 32.
const SECRET = '587f17dc2d218994867047c65133e38fc10c94f664fdc3c78370c49c0bf1a480';
const KEY = Buffer.from(SECRET, 'hex');
const OTHER_KEY = crypto.createHash('sha256').update('another-outseta-account').digest();
// The same 32 bytes written as base64: Outseta requires hex, so the handler refuses it.
const BAD_SECRET = 'WH8X3C0hiZSGcEfGUTPjj8EMlPZk/cPHg3DEnAvxpIA=';
const SIGNATURE_HEADER = 'x-hub-signature-256';

// Check vector: synthetic key and a fixed body (Outseta publishes none).
const VECTOR_BODY = '{"id":"evt_1","type":"test","data":{"a":1}}';
const VECTOR_SIGNATURE = 'sha256=1ed97849266847e37b36371bba32e3d8013a5cd0a9abcd59c52441be43da18ba';

// Made-up Person record: Outseta's signature article doesn't show a payload. Pretty-printed
// so a re-serialised body would not match.
const BODY = JSON.stringify({ Uid: 'wZmNw7Q2', Email: 'ada@example.com', FirstName: 'Ada', LastName: 'Lovelace' }, null, 2);
const TAMPER_FROM = 'ada@example.com';
const TAMPER_TO = 'eve@example.com';
process.env.OUTSETA_WEBHOOK_SIGNATURE_KEY = SECRET;

const { app, verifyOutsetaWebhook } = require('../src/index');

/** Sign like Outseta: sha256= + hex HMAC-SHA256 of the raw body, keyed with the hex-decoded key. */
function sign(body, { key = KEY } = {}) {
  return { 'x-hub-signature-256': `sha256=${crypto.createHmac('sha256', key).update(body).digest('hex')}` };
}

const post = (body, headers = {}, contentType = 'application/json') => {
  const req = request(app).post('/webhooks/outseta').set('Content-Type', contentType);
  for (const [name, value] of Object.entries(headers)) req.set(name, value);
  return req.send(body);
};

/** Drop one header from a signed set. */
const without = (headers, name) => Object.fromEntries(Object.entries(headers).filter(([key]) => key !== name));

beforeEach(() => {
  process.env.OUTSETA_WEBHOOK_SIGNATURE_KEY = SECRET;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('verifyOutsetaWebhook', () => {
  it('matches the check vector', () => {
    expect(verifyOutsetaWebhook(VECTOR_BODY, VECTOR_SIGNATURE, SECRET)).toBe(true);
    expect(verifyOutsetaWebhook(Buffer.from(VECTOR_BODY), VECTOR_SIGNATURE, SECRET)).toBe(true);
  });

  it('rejects the vector with a key that is not hex', () => {
    expect(verifyOutsetaWebhook(VECTOR_BODY, VECTOR_SIGNATURE, BAD_SECRET)).toBe(false);
  });
});

describe('POST /webhooks/outseta', () => {
  it('accepts a valid signature', async () => {
    const res = await post(BODY, sign(BODY));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('rejects a signature keyed with the secret as UTF-8 text instead of its decoded bytes', async () => {
    const res = await post(BODY, sign(BODY, { key: Buffer.from(SECRET, 'utf8') }));
    expect(res.status).toBe(401);
  });

  it('rejects a signature made with another secret', async () => {
    expect((await post(BODY, sign(BODY, { key: OTHER_KEY }))).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    expect((await post(BODY.replace(TAMPER_FROM, TAMPER_TO), sign(BODY))).status).toBe(401);
  });

  it('rejects a missing signature header', async () => {
    expect((await post(BODY, without(sign(BODY), SIGNATURE_HEADER))).status).toBe(401);
  });

  it('accepts a secret with a trailing newline', async () => {
    process.env.OUTSETA_WEBHOOK_SIGNATURE_KEY = `${SECRET}\n`;
    expect((await post(BODY, sign(BODY))).status).toBe(200);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"truncated": ';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('returns 500 when OUTSETA_WEBHOOK_SIGNATURE_KEY is not set', async () => {
    delete process.env.OUTSETA_WEBHOOK_SIGNATURE_KEY;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });

  it('returns 500 when the secret is not valid hex', async () => {
    process.env.OUTSETA_WEBHOOK_SIGNATURE_KEY = BAD_SECRET;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });

  it('rejects a signature keyed with the hex key decoded as base64', async () => {
    // A 64-character hex string is also valid base64: it decodes to 48 wrong bytes.
    expect((await post(BODY, sign(BODY, { key: Buffer.from(SECRET, 'base64') }))).status).toBe(401);
  });

  it('rejects a signature without the sha256= prefix', async () => {
    const bare = sign(BODY)[SIGNATURE_HEADER].slice('sha256='.length);
    expect((await post(BODY, { [SIGNATURE_HEADER]: bare })).status).toBe(401);
  });
});
