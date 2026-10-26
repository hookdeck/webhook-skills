const request = require('supertest');
const crypto = require('crypto');

// Convox suggests `openssl rand -hex 32`, but the Rack uses the value as its UTF-8 string
const SECRET = '9f2c1d7a5b8e4036a1d9c7e2b4f08a63d5e1c9b7a3f2084d6c5b1e9a7f3d2c40';
process.env.CONVOX_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

function v1For(body, t, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(`${t}.`).update(body).digest('hex');
}

function sign(body, timestamp = Math.floor(Date.now() / 1000), secret = SECRET) {
  return `t=${timestamp},v1=${v1For(body, timestamp, secret)}`;
}

function post(body, signature, contentType = 'application/json') {
  const req = request(app).post('/webhooks/convox').set('Content-Type', contentType);
  if (signature !== undefined) req.set('Convox-Signature', signature);
  return req.send(body);
}

// Shape of the payload in Convox's docs (app:budget:auto-shutdown:cancelled)
const event = (action, status = 'success', data = {}) =>
  JSON.stringify({
    action,
    status,
    timestamp: '2026-04-27T10:30:00Z',
    data: {
      app: 'myapp',
      rack: 'rack1',
      actor: 'alice@example.com',
      tick_id: 'tick-2026-04-27T10:30:00Z-3a7b4c2d8e9f4a6b8c4d3e2f1a0b9c8d',
      ...data,
    },
  });

describe('Convox webhook', () => {
  afterEach(() => {
    delete process.env.CONVOX_WEBHOOK_TOLERANCE_SECONDS;
    process.env.CONVOX_WEBHOOK_SECRET = SECRET;
  });

  it.each([
    'app:create',
    'build:create',
    'release:promote',
    'app:budget:cap',
    'app:budget:auto-shutdown:fired',
    'app:budget:auto-shutdown:cancelled',
    'release:manifest-advisory',
    'app:something:new',
  ])('accepts a valid signature for %s', async (action) => {
    const body = event(action);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('handles a failed build', async () => {
    const body = event('build:create', 'error', { message: 'docker build failed' });
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  it('verifies any content type', async () => {
    const body = event('app:create');
    const res = await post(body, sign(body), 'text/plain');
    expect(res.status).toBe(200);
  });

  it('accepts uppercase hex', async () => {
    const body = event('app:create');
    const t = Math.floor(Date.now() / 1000);
    const res = await post(body, `t=${t},v1=${v1For(body, t).toUpperCase()}`);
    expect(res.status).toBe(200);
  });

  it('accepts when any v1 matches (key rotation)', async () => {
    const body = event('app:create');
    const t = Math.floor(Date.now() / 1000);
    const old = v1For(body, t, 'previous-key');
    const current = v1For(body, t);
    expect((await post(body, `t=${t},v1=${old},v1=${current}`)).status).toBe(200);
    expect((await post(body, `t=${t},v1=${current},v1=${old}`)).status).toBe(200);
  });

  it('rejects when no v1 matches', async () => {
    const body = event('app:create');
    const t = Math.floor(Date.now() / 1000);
    const res = await post(body, `t=${t},v1=${v1For(body, t, 'a')},v1=${v1For(body, t, 'b')}`);
    expect(res.status).toBe(401);
  });

  it('ignores unknown keys such as v0', async () => {
    const body = event('app:create');
    const t = Math.floor(Date.now() / 1000);
    const res = await post(body, `v0=${'0'.repeat(64)},t=${t},v1=${v1For(body, t)}`);
    expect(res.status).toBe(200);
  });

  it('does not accept a v0-only signature', async () => {
    const body = event('app:create');
    const t = Math.floor(Date.now() / 1000);
    const res = await post(body, `t=${t},v0=${v1For(body, t)}`);
    expect(res.status).toBe(401);
  });

  it('uses the key as its UTF-8 string, not hex-decoded', async () => {
    const body = event('app:create');
    const t = Math.floor(Date.now() / 1000);
    const wrong = v1For(body, t, Buffer.from(SECRET, 'hex'));
    const res = await post(body, `t=${t},v1=${wrong}`);
    expect(res.status).toBe(401);
  });

  it('signs the t value exactly as it appears in the header', async () => {
    const body = event('app:create');
    const t = '0001714233600';
    const res = await post(body, `t=${t},v1=${v1For(body, t)}`);
    expect(res.status).toBe(200);
    // The same signature fails if t were re-formatted as a number
    const reformatted = `t=${t},v1=${v1For(body, Number(t))}`;
    expect((await post(body, reformatted)).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const body = event('app:create');
    const res = await post(event('app:budget:cap'), sign(body));
    expect(res.status).toBe(401);
  });

  it('rejects the wrong key', async () => {
    const body = event('app:create');
    const res = await post(body, sign(body, undefined, 'wrong-key'));
    expect(res.status).toBe(401);
  });

  it('rejects a missing header', async () => {
    const res = await post(event('app:create'));
    expect(res.status).toBe(401);
  });

  it('rejects an empty header', async () => {
    const res = await post(event('app:create'), '');
    expect(res.status).toBe(401);
  });

  it.each([
    ['no t', (b) => `v1=${v1For(b, 1714233600)}`],
    ['empty t', (b) => `t=,v1=${v1For(b, 1714233600)}`],
    ['non-numeric t', (b) => `t=abc,v1=${v1For(b, 'abc')}`],
    ['no v1', () => 't=1714233600'],
    ['short v1', (b) => `t=1714233600,v1=${v1For(b, 1714233600).slice(0, 62)}`],
    ['long v1', (b) => `t=1714233600,v1=${v1For(b, 1714233600)}00`],
    ['non-hex v1', () => `t=1714233600,v1=${'z'.repeat(64)}`],
    ['garbage', () => 'not-a-signature'],
  ])('rejects a malformed header: %s', async (_name, build) => {
    const body = event('app:create');
    const res = await post(body, build(body));
    expect(res.status).toBe(401);
  });

  it('rejects when the body is empty', async () => {
    const res = await request(app)
      .post('/webhooks/convox')
      .set('Convox-Signature', sign(event('app:create')));
    expect(res.status).toBe(401);
  });

  it('returns 400 for a validly signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await post(body, sign(body), 'text/plain');
    expect(res.status).toBe(400);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.CONVOX_WEBHOOK_SECRET;
    const body = event('app:create');
    const res = await post(body, sign(body));
    expect(res.status).toBe(500);
  });

  describe('timestamp tolerance', () => {
    const old = Math.floor(Date.now() / 1000) - 3600;

    it('is off by default, so an old timestamp (retry or replay) passes', async () => {
      const body = event('app:create');
      const res = await post(body, sign(body, old));
      expect(res.status).toBe(200);
    });

    it('rejects old timestamps when opted in', async () => {
      process.env.CONVOX_WEBHOOK_TOLERANCE_SECONDS = '300';
      const body = event('app:create');
      expect((await post(body, sign(body, old))).status).toBe(401);
      expect((await post(body, sign(body))).status).toBe(200);
    });

    it('treats 0 and non-numeric values as off', async () => {
      const body = event('app:create');
      for (const value of ['0', '', 'five minutes', '-5']) {
        process.env.CONVOX_WEBHOOK_TOLERANCE_SECONDS = value;
        const res = await post(body, sign(body, old));
        expect(res.status).toBe(200);
      }
    });
  });
});
