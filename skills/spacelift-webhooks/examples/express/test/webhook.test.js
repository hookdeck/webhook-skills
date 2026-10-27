const crypto = require('crypto');
const request = require('supertest');

const SECRET = 'test_spacelift_secret_0123456789';
process.env.SPACELIFT_WEBHOOK_SECRET = SECRET;

const app = require('../src/index');
const { verifySpaceliftSignature, classify, lastVersion } = require('../src/index');

// Payloads from Spacelift's documentation
const runPayload = {
  account: 'spacelift-io',
  state: 'FINISHED',
  stateVersion: 4,
  timestamp: 1596979684,
  run: {
    id: '01EF9PFPNFFM2MQXTJKHK1B869',
    branch: 'master',
    commit: { authorLogin: 'marcinwyszynski', hash: '0ee3a3b7266daf5a1d44a193a0f48ce995fa75eb', message: 'Update demo.tf' },
    createdAt: 1596979665,
    delta: { added: 0, changed: 0, deleted: 0, resources: 1 },
    triggeredBy: 'marcinw@spacelift.io',
    type: 'TRACKED',
  },
  stack: { id: 'spacelift-demo', name: 'Spacelift demo', description: '', labels: [] },
};
const errorPayload = {
  title: 'Invalid Stack Slug Triggered',
  body: "policy tried to trigger Stack 'this-is-not-a-stack' which either doesn't exist or this policy doesn't have access to",
  error: "policy triggered for Stack that doesn't exist",
  severity: 'ERROR',
  account: 'spacelift-io',
};

function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function send(method, body, headers = {}) {
  let req = request(app)[method.toLowerCase()]('/webhooks/spacelift');
  for (const [k, v] of Object.entries(headers)) req = req.set(k, v);
  return body === undefined ? req : req.set('Content-Type', 'application/json').send(body);
}

beforeEach(() => {
  lastVersion.clear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('verifySpaceliftSignature', () => {
  const body = Buffer.from(JSON.stringify(runPayload));

  it('accepts sha256=<hex>', () => {
    expect(verifySpaceliftSignature(body, `sha256=${sign(body)}`, SECRET)).toBe(true);
  });
  it('accepts the bare digest', () => {
    expect(verifySpaceliftSignature(body, sign(body), SECRET)).toBe(true);
  });
  it('accepts uppercase hex', () => {
    expect(verifySpaceliftSignature(body, `sha256=${sign(body).toUpperCase()}`, SECRET)).toBe(true);
  });
  it('rejects a wrong secret', () => {
    expect(verifySpaceliftSignature(body, `sha256=${sign(body, 'other')}`, SECRET)).toBe(false);
  });
  it('rejects a tampered body', () => {
    expect(verifySpaceliftSignature(Buffer.from('{}'), `sha256=${sign(body)}`, SECRET)).toBe(false);
  });
  it('rejects missing, empty and malformed headers', () => {
    expect(verifySpaceliftSignature(body, undefined, SECRET)).toBe(false);
    expect(verifySpaceliftSignature(body, '', SECRET)).toBe(false);
    expect(verifySpaceliftSignature(body, 'sha256=abc', SECRET)).toBe(false);
    expect(verifySpaceliftSignature(body, 'sha256=' + 'z'.repeat(64), SECRET)).toBe(false);
    expect(verifySpaceliftSignature(body, `sha256=${sign(body)}00`, SECRET)).toBe(false);
  });
  it('rejects when no secret is configured', () => {
    expect(verifySpaceliftSignature(body, `sha256=${sign(body)}`, '')).toBe(false);
  });
  it('uses the secret as UTF-8 bytes, not decoded', () => {
    const hexSecret = 'deadbeef';
    const decodedSig = crypto.createHmac('sha256', Buffer.from(hexSecret, 'hex')).update(body).digest('hex');
    expect(verifySpaceliftSignature(body, decodedSig, hexSecret)).toBe(false);
    expect(verifySpaceliftSignature(body, sign(body, hexSecret), hexSecret)).toBe(true);
  });
});

describe('classify', () => {
  it('recognises run and internal error payloads', () => {
    expect(classify(runPayload)).toBe('run');
    expect(classify(errorPayload)).toBe('internal_error');
    expect(classify({ foo: 1 })).toBe('unknown');
    expect(classify(null)).toBe('unknown');
  });
});

describe('POST /webhooks/spacelift', () => {
  it('handles a signed run message', async () => {
    const body = JSON.stringify(runPayload);
    const res = await send('POST', body, { 'X-Signature-256': `sha256=${sign(body)}` });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, type: 'run' });
  });

  it('handles a signed internal error message', async () => {
    const body = JSON.stringify(errorPayload);
    const res = await send('POST', body, { 'X-Signature-256': `sha256=${sign(body)}` });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, type: 'internal_error' });
  });

  it('verifies the exact bytes, not re-serialized JSON', async () => {
    const body = JSON.stringify(runPayload, null, 2);
    const ok = await send('POST', body, { 'X-Signature-256': sign(body) });
    expect(ok.status).toBe(200);
    const compact = await send('POST', body, { 'X-Signature-256': sign(JSON.stringify(runPayload)) });
    expect(compact.status).toBe(401);
  });

  it('accepts any content type', async () => {
    const body = JSON.stringify(errorPayload);
    const res = await request(app)
      .post('/webhooks/spacelift')
      .set('Content-Type', 'text/plain')
      .set('X-Signature-256', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature', async () => {
    const res = await send('POST', JSON.stringify(runPayload));
    expect(res.status).toBe(401);
  });

  it('rejects an X-Signature (SHA-1) header on its own', async () => {
    const body = JSON.stringify(runPayload);
    const sha1 = crypto.createHmac('sha1', SECRET).update(body).digest('hex');
    const res = await send('POST', body, { 'X-Signature': `sha1=${sha1}` });
    expect(res.status).toBe(401);
  });

  it('rejects a bad signature', async () => {
    const body = JSON.stringify(runPayload);
    const res = await send('POST', body, { 'X-Signature-256': `sha256=${sign(body, 'wrong')}` });
    expect(res.status).toBe(401);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await send('POST', body, { 'X-Signature-256': sign(body) });
    expect(res.status).toBe(400);
  });

  it('ignores a stale stateVersion', async () => {
    const newer = JSON.stringify({ ...runPayload, stateVersion: 5 });
    const older = JSON.stringify({ ...runPayload, stateVersion: 3 });
    await send('POST', newer, { 'X-Signature-256': sign(newer) });
    const res = await send('POST', older, { 'X-Signature-256': sign(older) });
    expect(res.status).toBe(200);
    expect(lastVersion.get(runPayload.run.id)).toBe(5);
  });
});

describe('other HTTP methods', () => {
  it.each(['PUT', 'PATCH', 'DELETE'])('verifies and handles %s', async (method) => {
    const body = JSON.stringify(runPayload);
    const ok = await send(method, body, { 'X-Signature-256': sign(body) });
    expect(ok.status).toBe(200);
    const bad = await send(method, body, { 'X-Signature-256': sign(body, 'wrong') });
    expect(bad.status).toBe(401);
  });

  it('verifies a GET with no body over zero bytes', async () => {
    const ok = await send('GET', undefined, { 'X-Signature-256': `sha256=${sign(Buffer.alloc(0))}` });
    expect(ok.status).toBe(200);
    expect(ok.body.type).toBe('unknown');
    const bad = await send('GET', undefined);
    expect(bad.status).toBe(401);
  });
});
