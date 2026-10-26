const crypto = require('crypto');
const request = require('supertest');

// Top.gg v1 secrets start with whs_ but are used WHOLE as UTF-8 key bytes (no decoding)
const SECRET = 'whs_9f8a1c2d3e4f5a6b7c8d9e0f1a2b3c4d';
process.env.TOP_GG_WEBHOOK_SECRET = SECRET;
delete process.env.TOP_GG_WEBHOOK_TOLERANCE_SECONDS;

const { app, verifyTopGgWebhook } = require('../src/index');

// hex(HMAC-SHA256(secret, `${t}.` + raw body bytes)); `t` stays a string, exactly as sent
function v1(body, secret = SECRET, t = String(Math.floor(Date.now() / 1000))) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${t}.`)
    .update(Buffer.isBuffer(body) ? body : Buffer.from(body))
    .digest('hex');
}

function sign(body, secret = SECRET, t = String(Math.floor(Date.now() / 1000))) {
  return `t=${t},v1=${v1(body, secret, t)}`;
}

const vote = {
  type: 'vote.create',
  data: {
    id: '808499215864008704',
    weight: 1,
    created_at: '2026-02-09T00:47:14.2510149+00:00',
    expires_at: '2026-02-09T12:47:14.2510149+00:00',
    project: { id: '803190510032756736', type: 'bot', platform: 'discord', platform_id: '160105994217586689' },
    query: { key1: 'value' },
    user: { id: 'top.gg id', platform_id: 'discord id', name: 'username', avatar_url: 'https://example.com/a.png' },
  },
};
const test = {
  type: 'webhook.test',
  data: {
    user: vote.data.user,
    project: vote.data.project,
  },
};

function post(body, signature, contentType = 'application/json') {
  const req = request(app).post('/webhooks/top-gg').set('Content-Type', contentType);
  if (signature !== undefined) req.set('x-topgg-signature', signature);
  return req.send(body);
}

describe('Top.gg webhook endpoint', () => {
  let logSpy;
  let errSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('accepts a signed vote.create', async () => {
    const body = JSON.stringify(vote);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Vote 808499215864008704'));
  });

  it('accepts a signed webhook.test', async () => {
    const body = JSON.stringify(test);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Test webhook'));
  });

  it('logs and acknowledges unknown event types', async () => {
    const body = JSON.stringify({ type: 'vote.expire', data: {} });
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Unhandled event type: vote.expire');
  });

  it('verifies any content type', async () => {
    const body = JSON.stringify(vote);
    const res = await post(body, sign(body), 'text/plain');
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature header with 401', async () => {
    const res = await post(JSON.stringify(vote));
    expect(res.status).toBe(401);
  });

  it('rejects an empty signature header with 401', async () => {
    const res = await post(JSON.stringify(vote), '');
    expect(res.status).toBe(401);
  });

  it('rejects a signature from the wrong secret', async () => {
    const body = JSON.stringify(vote);
    const res = await post(body, sign(body, 'whs_wrong'));
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(vote);
    const res = await post(JSON.stringify({ ...vote, type: 'webhook.test' }), sign(body));
    expect(res.status).toBe(401);
  });

  it('rejects a tampered timestamp', async () => {
    const body = JSON.stringify(vote);
    const t = String(Math.floor(Date.now() / 1000));
    const res = await post(body, `t=${Number(t) + 1},v1=${v1(body, SECRET, t)}`);
    expect(res.status).toBe(401);
  });

  it('rejects a header with no t value', async () => {
    const body = JSON.stringify(vote);
    expect((await post(body, `v1=${v1(body)}`)).status).toBe(401);
    expect((await post(body, `t=,v1=${v1(body)}`)).status).toBe(401);
  });

  it('rejects a header with no v1 value', async () => {
    const body = JSON.stringify(vote);
    expect((await post(body, 't=1700000000')).status).toBe(401);
    expect((await post(body, 't=1700000000,v1=')).status).toBe(401);
  });

  it('rejects signatures that are not exactly 64 hex characters', async () => {
    const body = JSON.stringify(vote);
    const good = v1(body);
    const t = Math.floor(Date.now() / 1000);
    for (const bad of [good.slice(0, 62), `${good}00`, `${good.slice(0, 62)}zz`, `${good.slice(0, 63)} `, `0x${good.slice(2)}`]) {
      const res = await post(body, `t=${t},v1=${bad}`);
      expect(res.status).toBe(401);
    }
  });

  it('accepts uppercase hex', async () => {
    const body = JSON.stringify(vote);
    const t = String(Math.floor(Date.now() / 1000));
    const res = await post(body, `t=${t},v1=${v1(body, SECRET, t).toUpperCase()}`);
    expect(res.status).toBe(200);
  });

  it('accepts when any v1 entry matches (key rotation) and ignores other keys', async () => {
    const body = JSON.stringify(vote);
    const t = String(Math.floor(Date.now() / 1000));
    const stale = v1(body, 'whs_old_secret', t);
    expect((await post(body, `t=${t}, v1=${stale}, v1=${v1(body, SECRET, t)}, v0=abc`)).status).toBe(200);
    expect((await post(body, `v0=${v1(body)},t=${t},v1=${v1(body, SECRET, t)}`)).status).toBe(200);
    expect((await post(body, `t=${t},v1=${stale},v0=${v1(body, SECRET, t)}`)).status).toBe(401);
  });

  it('uses t exactly as sent (no number round trip)', async () => {
    const body = JSON.stringify(vote);
    const t = '00' + Math.floor(Date.now() / 1000);
    expect((await post(body, `t=${t},v1=${v1(body, SECRET, t)}`)).status).toBe(200);
  });

  it('verifies the raw bytes, including non-UTF-8 content', async () => {
    const body = Buffer.concat([Buffer.from('{"type":"vote.create","data":{"x":"'), Buffer.from([0xff, 0xfe]), Buffer.from('"}}')]);
    const res = await post(body, sign(body), 'application/octet-stream');
    // Signature is valid, so it passes verification; the body is then parsed (as lossy UTF-8 JSON)
    expect(res.status).toBe(200);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const body = 'not json';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it.each([['[]'], ['"text"'], ['null'], ['42']])('returns 400 for a signed non-object body %s', async (body) => {
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('ignores wrong-typed fields instead of failing', async () => {
    for (const payload of [
      { type: 'vote.create', data: 'x' },
      { type: 'vote.create', data: { user: 5, project: [], id: 7, weight: 'heavy' } },
      { type: 'webhook.test', data: null },
      { type: { nested: true }, data: [] },
      {},
    ]) {
      const body = JSON.stringify(payload);
      expect((await post(body, sign(body))).status).toBe(200);
    }
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.TOP_GG_WEBHOOK_SECRET;
    const body = JSON.stringify(vote);
    const res = await post(body, sign(body));
    process.env.TOP_GG_WEBHOOK_SECRET = SECRET;
    expect(res.status).toBe(500);
  });

  it('exposes a health check', async () => {
    expect((await request(app).get('/health')).body).toEqual({ status: 'ok' });
  });
});

describe('verifyTopGgWebhook timestamp window', () => {
  const body = Buffer.from(JSON.stringify(vote));
  const now = 1_800_000_000;
  const old = String(now - 3600);

  it('does not reject old timestamps by default', () => {
    expect(verifyTopGgWebhook(body, sign(body, SECRET, old), SECRET, 0, now)).toBe(true);
  });

  it('rejects old timestamps when a tolerance is set', () => {
    expect(verifyTopGgWebhook(body, sign(body, SECRET, old), SECRET, 300, now)).toBe(false);
    expect(verifyTopGgWebhook(body, sign(body, SECRET, String(now - 10)), SECRET, 300, now)).toBe(true);
  });

  it('rejects a non-numeric t when a tolerance is set', () => {
    expect(verifyTopGgWebhook(body, sign(body, SECRET, 'abc'), SECRET, 300, now)).toBe(false);
  });

  it('reads the tolerance from TOP_GG_WEBHOOK_TOLERANCE_SECONDS', () => {
    process.env.TOP_GG_WEBHOOK_TOLERANCE_SECONDS = '300';
    try {
      expect(verifyTopGgWebhook(body, sign(body, SECRET, old), SECRET)).toBe(false);
    } finally {
      delete process.env.TOP_GG_WEBHOOK_TOLERANCE_SECONDS;
    }
    expect(verifyTopGgWebhook(body, sign(body, SECRET, old), SECRET)).toBe(true);
  });
});
