const request = require('supertest');
const crypto = require('crypto');

// Bitculator signing secrets look like whsec_<random> and are used as plain strings, prefix included
// (not base64-decoded); this one is only for tests.
const SECRET = 'whsec_k5cQ1x9jJ2mW7pR4tY8uB3nV6zA0sD5f';
process.env.BITCULATOR_WEBHOOK_SECRET = SECRET;

const { app, verifyBitculator } = require('../src/index');

const now = () => Math.floor(Date.now() / 1000);

// v1 = HMAC-SHA256 hex of "<t>.<raw body>"
function v1For(body, timestamp, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.`).update(body).digest('hex');
}

function sign(body, timestamp = now(), secret = SECRET) {
  return `t=${timestamp},v1=${v1For(body, timestamp, secret)}`;
}

function post(body, signature, contentType = 'application/json') {
  const req = request(app).post('/webhooks/bitculator').set('Content-Type', contentType);
  if (signature !== undefined) req.set('X-Bitculator-Signature', signature);
  return req.send(body);
}

// ILLUSTRATIVE body: Bitculator does not document the delivery payload. Only `test: true` is a
// documented fact; data.alarm mirrors an item of GET /api/v1/alarms.
const event = (overrides = {}) =>
  JSON.stringify({
    event: 'alarm.triggered',
    test: true,
    data: {
      alarm: {
        id: 42,
        name: 'BTC above 100k',
        coin: { slug: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
        metric: 'rate',
        direction: 'above',
        target: '100000',
        notification: 'webhook',
        status: 'triggered',
        created_at: '2026-01-15T10:00:00Z',
      },
    },
    ...overrides,
  });

describe('Bitculator webhook', () => {
  let logSpy;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.BITCULATOR_WEBHOOK_TOLERANCE_SECONDS;
    process.env.BITCULATOR_WEBHOOK_SECRET = SECRET;
  });

  it('accepts a valid signature for alarm.triggered', async () => {
    const body = event();
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Test alarm triggered: BTC above 100k BTC above 100000'));
  });

  it('verifies a Buffer body directly and rejects non-ASCII digits in t', () => {
    const body = Buffer.from('{"hello":"world"}');
    expect(verifyBitculator(body, `t=1700000000,v1=${v1For(body, '1700000000')}`, SECRET)).toBe(true);
    // Full-width digits match \d in some regex engines; t must be ASCII 0-9
    const t = '１７００００００００';
    expect(verifyBitculator(body, `t=${t},v1=${v1For(body, t)}`, SECRET)).toBe(false);
  });

  it('verifies any content type', async () => {
    const body = event();
    const res = await post(body, sign(body), 'text/plain');
    expect(res.status).toBe(200);
  });

  it('assumes alarm.triggered when the body names no event', async () => {
    const body = JSON.stringify({ something: 'else' });
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('alarm triggered: (unnamed)'));
  });

  it('reads the event name from `type` when `event` is absent', async () => {
    const body = JSON.stringify({ type: 'alarm.other' });
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Unhandled event: alarm.other');
  });

  it('acknowledges a verified non-JSON body', async () => {
    const body = 'not json at all';
    const res = await post(body, sign(body), 'text/plain');
    expect(res.status).toBe(200);
  });

  it.each([['[1,2,3]'], ['null'], ['"text"'], ['42']])('acknowledges a verified non-object JSON body %s', async (body) => {
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  it('ignores wrong-typed fields instead of failing', async () => {
    const bodies = [
      { event: 5, data: 'x' },
      { event: 'alarm.triggered', test: 'yes', data: [] },
      { event: 'alarm.triggered', data: { alarm: 'nope' } },
      { event: 'alarm.triggered', data: { alarm: { name: 7, coin: [], direction: {}, target: 100000 } } },
      { event: 'alarm.triggered', data: { alarm: { coin: { symbol: 1 } } } },
    ];
    for (const b of bodies) {
      const body = JSON.stringify(b);
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
    }
  });

  it('uses the whole secret as UTF-8 bytes: neither stripped nor base64-decoded', async () => {
    const body = event();
    const t = now();
    for (const key of [SECRET.slice('whsec_'.length), Buffer.from(SECRET.slice('whsec_'.length), 'base64')]) {
      const v1 = crypto.createHmac('sha256', key).update(`${t}.${body}`).digest('hex');
      const res = await post(body, `t=${t},v1=${v1}`);
      expect(res.status).toBe(401);
    }
  });

  it('signs the t value exactly as it appears in the header', async () => {
    const body = event();
    const t = '01700000000'; // leading zero: parsing to a number and re-formatting would change it
    const res = await post(body, `t=${t},v1=${v1For(body, t)}`);
    expect(res.status).toBe(200);
    const reformatted = await post(body, `t=${t},v1=${v1For(body, Number(t))}`);
    expect(reformatted.status).toBe(401);
  });

  it('verifies the exact bytes, not re-serialised JSON', async () => {
    const body = '{ "event" : "alarm.triggered",   "test": true }';
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    const compact = JSON.stringify(JSON.parse(body));
    const bad = await post(body, sign(compact));
    expect(bad.status).toBe(401);
  });

  it('accepts v1 in uppercase hex', async () => {
    const body = event();
    const t = now();
    const res = await post(body, `t=${t},v1=${v1For(body, t).toUpperCase()}`);
    expect(res.status).toBe(200);
  });

  it('accepts when any v1 entry matches and ignores other keys', async () => {
    const body = event();
    const t = now();
    const wrong = 'a'.repeat(64);
    const header = `v0=${wrong},v1=${wrong},t=${t},v1=${v1For(body, t)},extra=1`;
    const res = await post(body, header);
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature header', async () => {
    const res = await post(event());
    expect(res.status).toBe(401);
  });

  it('rejects an empty signature header', async () => {
    const res = await post(event(), '');
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const body = event();
    const res = await post(body.replace('100000', '1'), sign(body));
    expect(res.status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = event();
    const res = await post(body, sign(body, now(), 'whsec_wrong'));
    expect(res.status).toBe(401);
  });

  it('rejects a header without t', async () => {
    const body = event();
    const res = await post(body, `v1=${v1For(body, now())}`);
    expect(res.status).toBe(401);
  });

  it.each([['abc'], ['12.5'], ['-5'], ['1e9'], ['']])('rejects a non-digit t value %j', async (t) => {
    const body = event();
    const res = await post(body, `t=${t},v1=${v1For(body, t)}`);
    expect(res.status).toBe(401);
  });

  it('rejects a header without v1', async () => {
    const body = event();
    const res = await post(body, `t=${now()}`);
    expect(res.status).toBe(401);
  });

  it.each([
    ['too short', 'abcd'],
    ['too long', 'a'.repeat(66)],
    ['not hex', 'z'.repeat(64)],
    ['non-ASCII', 'é'.repeat(64)],
    ['empty', ''],
  ])('rejects a malformed v1 (%s)', async (_name, v1) => {
    const body = event();
    const res = await post(body, `t=${now()},v1=${v1}`);
    expect(res.status).toBe(401);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.BITCULATOR_WEBHOOK_SECRET;
    const body = event();
    const res = await post(body, sign(body));
    expect(res.status).toBe(500);
  });

  describe('timestamp window (opt-in)', () => {
    const old = now() - 3600;

    it('is off by default: an old timestamp is accepted', async () => {
      const body = event();
      const res = await post(body, sign(body, old));
      expect(res.status).toBe(200);
    });

    it('treats 0 as off', async () => {
      process.env.BITCULATOR_WEBHOOK_TOLERANCE_SECONDS = '0';
      const body = event();
      const res = await post(body, sign(body, old));
      expect(res.status).toBe(200);
    });

    it('rejects an old timestamp when set to 300', async () => {
      process.env.BITCULATOR_WEBHOOK_TOLERANCE_SECONDS = '300';
      const body = event();
      const res = await post(body, sign(body, old));
      expect(res.status).toBe(401);
    });

    it('rejects a timestamp too far in the future (absolute difference)', async () => {
      process.env.BITCULATOR_WEBHOOK_TOLERANCE_SECONDS = '300';
      const body = event();
      const res = await post(body, sign(body, now() + 3600));
      expect(res.status).toBe(401);
    });

    it('accepts a fresh timestamp when set to 300', async () => {
      process.env.BITCULATOR_WEBHOOK_TOLERANCE_SECONDS = '300';
      const body = event();
      const res = await post(body, sign(body, now() - 100));
      expect(res.status).toBe(200);
    });

    it('leaves the check off for an invalid value', async () => {
      process.env.BITCULATOR_WEBHOOK_TOLERANCE_SECONDS = 'five minutes';
      const body = event();
      const res = await post(body, sign(body, old));
      expect(res.status).toBe(200);
    });
  });
});
