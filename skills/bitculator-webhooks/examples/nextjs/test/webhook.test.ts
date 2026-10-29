import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Bitculator signing secrets look like whsec_<random> and are used as plain strings, prefix included
// (not base64-decoded); this one is only for tests.
const SECRET = 'whsec_k5cQ1x9jJ2mW7pR4tY8uB3nV6zA0sD5f';

let POST: (request: NextRequest) => Promise<Response>;
let verifyBitculator: (rawBody: Buffer, header: string, secret: string) => boolean;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  process.env.BITCULATOR_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/bitculator/route'));
  ({ verifyBitculator } = await import('../lib/bitculator'));
});

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.BITCULATOR_WEBHOOK_TOLERANCE_SECONDS;
  process.env.BITCULATOR_WEBHOOK_SECRET = SECRET;
});

const now = () => Math.floor(Date.now() / 1000);

// v1 = HMAC-SHA256 hex of "<t>.<raw body>"
function v1For(body: string, timestamp: number | string, secret: string | Buffer = SECRET): string {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

function sign(body: string, timestamp: number | string = now(), secret = SECRET): string {
  return `t=${timestamp},v1=${v1For(body, timestamp, secret)}`;
}

function post(
  body: string,
  signature?: string,
  contentType = 'application/json',
  eventName: string | undefined = 'alarm.triggered'
) {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature !== undefined) headers['x-bitculator-signature'] = signature;
  if (eventName !== undefined) headers['x-bitculator-event'] = eventName;
  return POST(
    new NextRequest('http://localhost:3000/webhooks/bitculator', { method: 'POST', headers, body })
  );
}

// ILLUSTRATIVE body: Bitculator documents a JSON body but not its fields. Only `test: true` is a
// documented fact; data.alarm mirrors an item of GET /api/v1/alarms.
const event = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
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
  it('accepts a valid signature for alarm.triggered', async () => {
    const body = event();
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Test alarm triggered: BTC above 100k BTC above 100000'));
  });

  it('verifies a Buffer body directly and rejects non-ASCII digits in t', () => {
    const body = '{"hello":"world"}';
    expect(verifyBitculator(Buffer.from(body), sign(body, '1700000000'), SECRET)).toBe(true);
    // Full-width digits match \d in some regex engines; t must be ASCII 0-9
    const t = '１７００００００００';
    expect(verifyBitculator(Buffer.from(body), sign(body, t), SECRET)).toBe(false);
  });

  it('verifies any content type', async () => {
    const body = event();
    expect((await post(body, sign(body), 'text/plain')).status).toBe(200);
  });

  it('assumes alarm.triggered when X-Bitculator-Event is absent', async () => {
    const body = JSON.stringify({ something: 'else' });
    expect((await post(body, sign(body), 'application/json', undefined)).status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('alarm triggered: (unnamed)'));
  });

  it('acknowledges and skips an unknown X-Bitculator-Event', async () => {
    const body = event();
    const res = await post(body, sign(body), 'application/json', 'alarm.other');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(logSpy).toHaveBeenCalledWith('Skipping unhandled event: alarm.other');
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('alarm triggered'));
  });

  it('verifies the signature before looking at X-Bitculator-Event (it is not signed)', async () => {
    const body = event();
    const res = await post(body, sign(body, now(), 'whsec_wrong'), 'application/json', 'alarm.other');
    expect(res.status).toBe(401);
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Skipping'));
  });

  it('ignores a body `event` field: the header is the routing label', async () => {
    const body = JSON.stringify({ event: 'alarm.other', data: { alarm: { name: 'X' } } });
    expect((await post(body, sign(body))).status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('alarm triggered: X'));
  });

  it('acknowledges a verified non-JSON body', async () => {
    const body = 'not json at all';
    expect((await post(body, sign(body), 'text/plain')).status).toBe(200);
  });

  it.each(['[1,2,3]', 'null', '"text"', '42'])('acknowledges a verified non-object JSON body %s', async (body) => {
    expect((await post(body, sign(body))).status).toBe(200);
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
      expect((await post(body, sign(body))).status).toBe(200);
    }
  });

  it('uses the whole secret as UTF-8 bytes: neither stripped nor base64-decoded', async () => {
    const body = event();
    const t = now();
    const stripped = SECRET.slice('whsec_'.length);
    for (const key of [stripped, Buffer.from(stripped, 'base64')]) {
      expect((await post(body, `t=${t},v1=${v1For(body, t, key)}`)).status).toBe(401);
    }
  });

  it('signs the t value exactly as it appears in the header', async () => {
    const body = event();
    const t = '01700000000'; // leading zero: parsing to a number and re-formatting would change it
    expect((await post(body, `t=${t},v1=${v1For(body, t)}`)).status).toBe(200);
    expect((await post(body, `t=${t},v1=${v1For(body, Number(t))}`)).status).toBe(401);
  });

  it('verifies the exact bytes, not re-serialised JSON', async () => {
    const body = '{ "event" : "alarm.triggered",   "test": true }';
    expect((await post(body, sign(body))).status).toBe(200);
    const compact = JSON.stringify(JSON.parse(body));
    expect((await post(body, sign(compact))).status).toBe(401);
  });

  it('accepts v1 in uppercase hex', async () => {
    const body = event();
    const t = now();
    expect((await post(body, `t=${t},v1=${v1For(body, t).toUpperCase()}`)).status).toBe(200);
  });

  it('accepts when any v1 entry matches and ignores other keys', async () => {
    const body = event();
    const t = now();
    const wrong = 'a'.repeat(64);
    const header = `v0=${wrong},v1=${wrong},t=${t},v1=${v1For(body, t)},extra=1`;
    expect((await post(body, header)).status).toBe(200);
  });

  it('rejects a missing signature header', async () => {
    expect((await post(event())).status).toBe(401);
  });

  it('rejects an empty signature header', async () => {
    expect((await post(event(), '')).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const body = event();
    expect((await post(body.replace('100000', '1'), sign(body))).status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = event();
    expect((await post(body, sign(body, now(), 'whsec_wrong'))).status).toBe(401);
  });

  it('rejects a header without t', async () => {
    const body = event();
    expect((await post(body, `v1=${v1For(body, now())}`)).status).toBe(401);
  });

  it.each(['abc', '12.5', '-5', '1e9', ''])('rejects a non-digit t value %j', async (t) => {
    const body = event();
    expect((await post(body, `t=${t},v1=${v1For(body, t)}`)).status).toBe(401);
  });

  it('rejects a header without v1', async () => {
    const body = event();
    expect((await post(body, `t=${now()}`)).status).toBe(401);
  });

  it.each([
    ['too short', 'abcd'],
    ['too long', 'a'.repeat(66)],
    ['not hex', 'z'.repeat(64)],
    ['non-ASCII', 'é'.repeat(64)],
    ['empty', ''],
  ])('rejects a malformed v1 (%s)', async (_name, v1) => {
    const body = event();
    expect((await post(body, `t=${now()},v1=${v1}`)).status).toBe(401);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.BITCULATOR_WEBHOOK_SECRET;
    const body = event();
    expect((await post(body, sign(body))).status).toBe(500);
  });

  describe('timestamp window (opt-in)', () => {
    const old = now() - 3600;

    it('is off by default: an old timestamp is accepted', async () => {
      const body = event();
      expect((await post(body, sign(body, old))).status).toBe(200);
    });

    it('treats 0 as off', async () => {
      process.env.BITCULATOR_WEBHOOK_TOLERANCE_SECONDS = '0';
      const body = event();
      expect((await post(body, sign(body, old))).status).toBe(200);
    });

    it('rejects an old timestamp when set to 300', async () => {
      process.env.BITCULATOR_WEBHOOK_TOLERANCE_SECONDS = '300';
      const body = event();
      expect((await post(body, sign(body, old))).status).toBe(401);
    });

    it('rejects a timestamp too far in the future (absolute difference)', async () => {
      process.env.BITCULATOR_WEBHOOK_TOLERANCE_SECONDS = '300';
      const body = event();
      expect((await post(body, sign(body, now() + 3600))).status).toBe(401);
    });

    it('accepts a fresh timestamp when set to 300', async () => {
      process.env.BITCULATOR_WEBHOOK_TOLERANCE_SECONDS = '300';
      const body = event();
      expect((await post(body, sign(body, now() - 100))).status).toBe(200);
    });

    it('leaves the check off for an invalid value', async () => {
      process.env.BITCULATOR_WEBHOOK_TOLERANCE_SECONDS = 'five minutes';
      const body = event();
      expect((await post(body, sign(body, old))).status).toBe(200);
    });
  });
});
