const request = require('supertest');
const crypto = require('crypto');

const SECRET = 'test_bump_secret_token';
process.env.BUMP_SH_WEBHOOK_SECRET = SECRET;

const { app, verifyBumpSignature } = require('../src/index');

/** Generate a real Bump.sh signature: "sha256=" + hex HMAC-SHA256 of the raw body. */
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

const samplePayload = () =>
  JSON.stringify({
    api: { id: 'doc_123', name: 'Payments API' },
    diff: { id: 'diff_456', breaking: false, structure: [{ id: 'POST /charges', status: 'added' }] },
  });

function post(body, headers = {}, contentType = 'application/json') {
  const req = request(app).post('/webhooks/bump-sh').set('Content-Type', contentType);
  Object.entries(headers).forEach(([k, v]) => req.set(k, v));
  // Send a string: superagent would JSON-serialize a Buffer when the type is JSON.
  return req.send(body);
}

describe('Bump.sh webhook endpoint', () => {
  afterEach(() => {
    process.env.BUMP_SH_WEBHOOK_SECRET = SECRET;
  });

  it('accepts a valid sha256= signature', async () => {
    const body = samplePayload();
    const res = await post(body, { 'X-Bump-Signature-256': `sha256=${sign(body)}` });
    expect(res.status).toBe(200);
  });

  it('accepts a bare hex signature (no prefix)', async () => {
    const body = samplePayload();
    const res = await post(body, { 'X-Bump-Signature-256': sign(body) });
    expect(res.status).toBe(200);
  });

  it('accepts uppercase hex', async () => {
    const body = samplePayload();
    const res = await post(body, { 'X-Bump-Signature-256': `sha256=${sign(body).toUpperCase()}` });
    expect(res.status).toBe(200);
  });

  it('verifies the exact bytes for any content type', async () => {
    // Odd spacing and key order must be preserved: the signature covers raw bytes.
    const body = '{ "diff" : {"a":1},\n  "api":{"b":2} }';
    const res = await post(body, { 'X-Bump-Signature-256': `sha256=${sign(body)}` }, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('rejects a tampered body', async () => {
    const body = samplePayload();
    const res = await post(`${body} `, { 'X-Bump-Signature-256': `sha256=${sign(body)}` });
    expect(res.status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = samplePayload();
    const res = await post(body, { 'X-Bump-Signature-256': `sha256=${sign(body, 'other_secret')}` });
    expect(res.status).toBe(401);
  });

  it('rejects a missing signature header', async () => {
    const res = await post(samplePayload());
    expect(res.status).toBe(401);
  });

  it('rejects an empty signature header', async () => {
    const res = await post(samplePayload(), { 'X-Bump-Signature-256': '' });
    expect(res.status).toBe(401);
  });

  it('rejects malformed signature values', async () => {
    const body = samplePayload();
    const good = sign(body);
    const malformed = [
      'sha256=',
      'sha256=abc123',
      `sha256=${good}00`,
      `sha256=${good.slice(0, 62)}zz`,
      `sha256=${good.slice(0, 63)} `,
      `sha1=${good}`,
      `sha256=sha256=${good}`,
      'not-a-signature',
    ];
    for (const value of malformed) {
      const res = await post(body, { 'X-Bump-Signature-256': value });
      expect(res.status).toBe(401);
    }
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.BUMP_SH_WEBHOOK_SECRET;
    const body = samplePayload();
    const res = await post(body, { 'X-Bump-Signature-256': `sha256=${sign(body)}` });
    expect(res.status).toBe(500);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await post(body, { 'X-Bump-Signature-256': `sha256=${sign(body)}` });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a signed JSON body that is not an object', async () => {
    for (const body of ['[]', 'null', '"text"', '42']) {
      const res = await post(body, { 'X-Bump-Signature-256': `sha256=${sign(body)}` });
      expect(res.status).toBe(400);
    }
  });

  it('ignores wrong-typed api and diff fields instead of failing', async () => {
    for (const payload of [
      { api: 'x', diff: 1 },
      { api: null, diff: [] },
      { api: [1], diff: 'y' },
      {},
    ]) {
      const body = JSON.stringify(payload);
      const res = await post(body, { 'X-Bump-Signature-256': `sha256=${sign(body)}` });
      expect(res.status).toBe(200);
    }
  });

  it('does not accept GET on the webhook route', async () => {
    const res = await request(app).get('/webhooks/bump-sh');
    expect(res.status).toBe(404);
  });
});

describe('verifyBumpSignature', () => {
  it('returns false when the secret or header is missing', () => {
    const body = Buffer.from('{}');
    expect(verifyBumpSignature(body, undefined, SECRET)).toBe(false);
    expect(verifyBumpSignature(body, `sha256=${sign(body)}`, undefined)).toBe(false);
    expect(verifyBumpSignature(body, `sha256=${sign(body)}`, '')).toBe(false);
  });

  it('verifies binary bodies byte for byte', () => {
    const body = Buffer.from([0xff, 0xfe, 0x00, 0x7b, 0x7d]);
    expect(verifyBumpSignature(body, `sha256=${sign(body)}`, SECRET)).toBe(true);
  });
});
