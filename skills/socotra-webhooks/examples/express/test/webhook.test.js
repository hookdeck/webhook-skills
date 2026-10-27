const request = require('supertest');
const crypto = require('crypto');

// Endpoint secret: 8-64 alphanumerics or underscores. Used as UTF-8 bytes.
const SECRET = 'socotra_test_secret_0123456789';
process.env.SOCOTRA_WEBHOOK_SECRET = SECRET;

const { app, verifySocotraSignature } = require('../src/index');

// Real signing, as Socotra does it: HMAC-SHA256 over "<t>.<body>" (t in Unix ms), hex.
function sign(body, { t = String(Date.now()), secret = SECRET, tag } = {}) {
  const bodyBuf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const parts = [Buffer.from(`${t}.`), bodyBuf];
  if (tag !== undefined) parts.push(Buffer.from(`.${tag}`));
  const v1 = crypto.createHmac('sha256', secret).update(Buffer.concat(parts)).digest('hex');
  return { t, v1, header: `t=${t},v1=${v1}${tag !== undefined ? `,tag=${tag}` : ''}` };
}

const event = (type, extra = {}) =>
  JSON.stringify({
    locator: '9a8b7c6d-1111-2222-3333-444455556666',
    requestId: 'req-1',
    userLocator: 'user-1',
    timestamp: 1695835536078,
    type,
    data: {},
    ...extra,
  });

function post(body, header, method = 'post') {
  let req = request(app)[method]('/webhooks/socotra').set('Content-Type', 'application/json');
  if (header !== undefined) req = req.set('socotra-signature', header);
  return req.send(body);
}

describe('Socotra webhook verification', () => {
  let logSpy;
  beforeEach(() => {
    delete process.env.SOCOTRA_WEBHOOK_TOLERANCE_SECONDS;
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => logSpy.mockRestore());

  it('accepts a valid signature', async () => {
    const body = event('policy.quote.issue');
    const res = await post(body, sign(body).header);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Quote issued'));
  });

  it('accepts when any v1 entry matches (key rotation)', async () => {
    const body = event('policy.account.create');
    const { t, v1 } = sign(body);
    const bad = 'a'.repeat(64);
    expect((await post(body, `t=${t},v1=${bad},v1=${v1}`)).status).toBe(200);
    expect((await post(body, `t=${t},v1=${v1},v1=${bad}`)).status).toBe(200);
  });

  it('ignores other keys such as v0', async () => {
    const body = event('policy.account.create');
    const { t, v1 } = sign(body);
    expect((await post(body, `v0=${'b'.repeat(64)},t=${t},v1=${v1}`)).status).toBe(200);
  });

  it('accepts uppercase hex', async () => {
    const body = event('policy.quote.accept');
    const { t, v1 } = sign(body);
    expect((await post(body, `t=${t},v1=${v1.toUpperCase()}`)).status).toBe(200);
  });

  it('uses the t string exactly as sent', async () => {
    const body = event('document.ready');
    const t = '0001695835536124'; // parsing to a number and back would change it
    expect((await post(body, sign(body, { t }).header)).status).toBe(200);
  });

  it('verifies the exact raw bytes, not re-serialised JSON', async () => {
    const body = '{ "type" : "policy.quote.issue",   "data": {"a":  1} }\n';
    expect((await post(body, sign(body).header)).status).toBe(200);
  });

  it('verifies non-UTF-8 bytes without re-encoding', async () => {
    const body = Buffer.from([0x7b, 0xff, 0xfe, 0x7d]); // not valid UTF-8
    const res = await request(app)
      .post('/webhooks/socotra')
      .set('Content-Type', 'application/octet-stream')
      .set('socotra-signature', sign(body).header)
      .send(body);
    expect(res.status).toBe(400); // authentic, but not JSON
    expect(res.body.error).toBe('Invalid JSON');
  });

  it('rejects a missing signature header', async () => {
    expect((await post(event('policy.quote.issue'))).status).toBe(401);
  });

  it('rejects an empty signature header', async () => {
    expect((await post(event('policy.quote.issue'), '')).status).toBe(401);
  });

  it('rejects a header with no t=', async () => {
    const body = event('policy.quote.issue');
    expect((await post(body, `v1=${sign(body).v1}`)).status).toBe(401);
  });

  it('rejects a header with no v1=', async () => {
    expect((await post(event('policy.quote.issue'), 't=1695835536124')).status).toBe(401);
  });

  it('rejects malformed signatures (length and alphabet)', async () => {
    const body = event('policy.quote.issue');
    const { t, v1 } = sign(body);
    for (const bad of [v1.slice(0, 62), `${v1}00`, 'z'.repeat(64), `${v1.slice(0, 62)}zz`, `${v1} `.concat('x')]) {
      expect((await post(body, `t=${t},v1=${bad}`)).status).toBe(401);
    }
  });

  it('rejects a tampered body', async () => {
    const header = sign(event('policy.quote.issue')).header;
    expect((await post(event('policy.quote.refuse'), header)).status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = event('policy.quote.issue');
    expect((await post(body, sign(body, { secret: 'some_other_secret_99' }).header)).status).toBe(401);
  });

  it('rejects a tagged endpoint (signs {t}.{body}.{tag})', async () => {
    const body = event('policy.quote.issue');
    expect((await post(body, sign(body, { tag: 'secret-1' }).header)).status).toBe(401);
  });

  it('rejects a changed t', async () => {
    const body = event('policy.quote.issue');
    const { v1 } = sign(body, { t: '1695835536124' });
    expect((await post(body, `t=1695835536125,v1=${v1}`)).status).toBe(401);
  });

  it.each(['post', 'put', 'patch', 'delete'])('accepts %s', async (method) => {
    const body = event('billing.invoice.generate');
    const res = await post(body, sign(body).header, method);
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Invoice generated'));
  });

  it('verifies a bodyless GET over zero bytes and acknowledges it', async () => {
    const res = await request(app).get('/webhooks/socotra').set('socotra-signature', sign('').header);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('rejects an unsigned GET', async () => {
    expect((await request(app).get('/webhooks/socotra')).status).toBe(401);
  });

  it('rejects an authentic body that is not JSON with 400', async () => {
    const body = 'not json';
    const res = await post(body, sign(body).header);
    expect(res.status).toBe(400);
  });

  it('logs unknown event types and still returns 200', async () => {
    const body = event('custom.my.thing');
    expect((await post(body, sign(body).header)).status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Unhandled event type: custom.my.thing');
  });

  describe('optional timestamp tolerance', () => {
    const old = String(Date.now() - 60 * 60 * 1000); // an hour ago, in ms

    it('is off by default: old timestamps are accepted (Hookdeck retries and replays)', async () => {
      const body = event('policy.quote.issue');
      expect((await post(body, sign(body, { t: old }).header)).status).toBe(200);
    });

    it('rejects old timestamps when enabled', async () => {
      process.env.SOCOTRA_WEBHOOK_TOLERANCE_SECONDS = '300';
      const body = event('policy.quote.issue');
      expect((await post(body, sign(body, { t: old }).header)).status).toBe(401);
    });

    it('accepts fresh timestamps when enabled', async () => {
      process.env.SOCOTRA_WEBHOOK_TOLERANCE_SECONDS = '300';
      const body = event('policy.quote.issue');
      expect((await post(body, sign(body).header)).status).toBe(200);
    });

    it('treats 0 as off', async () => {
      process.env.SOCOTRA_WEBHOOK_TOLERANCE_SECONDS = '0';
      const body = event('policy.quote.issue');
      expect((await post(body, sign(body, { t: old }).header)).status).toBe(200);
    });
  });
});

describe('verifySocotraSignature', () => {
  it('returns false without a secret or header', () => {
    const body = Buffer.from('{}');
    expect(verifySocotraSignature(body, sign(body).header, '')).toBe(false);
    expect(verifySocotraSignature(body, undefined, SECRET)).toBe(false);
  });

  it('returns true for a valid signature', () => {
    const body = Buffer.from('{"type":"policy.quote.issue"}');
    expect(verifySocotraSignature(body, sign(body).header, SECRET)).toBe(true);
  });
});
