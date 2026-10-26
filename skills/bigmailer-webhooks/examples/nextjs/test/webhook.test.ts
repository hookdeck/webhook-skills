import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// BigMailer signing secrets are opaque strings; these are only for tests
const SECRET = 'test_bigmailer_secret_3c9e1f7a';
const OLD_SECRET = 'old_bigmailer_secret_81d4b6e2';

let POST: (request: NextRequest) => Promise<Response>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  process.env.BIGMAILER_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/bigmailer/route'));
});

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  delete process.env.BIGMAILER_WEBHOOK_TOLERANCE_SECONDS;
  process.env.BIGMAILER_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const now = () => Math.floor(Date.now() / 1000);

const mac = (key: string, timestamp: string | number, body: string) =>
  crypto.createHmac('sha256', key).update(`${timestamp}.${body}`).digest('hex');

// Matches BigMailer's header format: t=<unix>,v1=<hex>
function sign(body: string, { timestamp = now(), secret = SECRET }: { timestamp?: number; secret?: string } = {}): string {
  return `t=${timestamp},v1=${mac(secret, timestamp, body)}`;
}

const ids = {
  brand_id: '0da934ea-f96f-4f2f-85dd-0e8ceb9cba0e',
  campaign_id: '9ebe0652-6364-4688-897c-cf2655f988e8',
  contact_id: 'f36999a4-7fc0-4a03-868c-21fad154db1b',
};

// Payloads follow the sample payloads in BigMailer's webhook event type docs
const base = { date: 1579811821, campaign_id: ids.campaign_id, contact_id: ids.contact_id, email: 'test@example.com' };
const samples: Record<string, object> = {
  bounce: { ...base, type: 'hard' },
  click: { ...base, link_id: 'a1f82283-aa9a-4de8-a803-3860a4df1ce4', url: 'https://www.example.com/' },
  complaint: base,
  open: base,
  unsubscribe: {
    ...base,
    unsubscribe_all: false,
    unsubscribe_ids: ['48e7b6d6-4c2f-4819-9294-41aaed22f837', 'aa3f3b4c-862e-4a00-aadb-0d82e4def938'],
  },
};

function event(type: string): string {
  return JSON.stringify({ type, brand_id: ids.brand_id, [type]: samples[type] ?? base });
}

function post(body: string, headers: Record<string, string> = {}, contentType = 'application/json') {
  return POST(
    new NextRequest('http://localhost:3000/webhooks/bigmailer', {
      method: 'POST',
      headers: { 'content-type': contentType, ...headers },
      body,
    })
  );
}

const sig = (value: string) => ({ 'x-bigmailer-signature': value });

describe('BigMailer webhook signature verification', () => {
  it('accepts a valid v1 signature', async () => {
    const body = event('bounce');
    const res = await post(body, sig(sign(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('matches the documented header example shape', async () => {
    const body = event('open');
    const header = sign(body);
    expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect((await post(body, sig(header))).status).toBe(200);
  });

  it('accepts when any v1 entry matches (key rotation), first or last', async () => {
    const body = event('click');
    const t = now();
    expect((await post(body, sig(`t=${t},v1=${mac(SECRET, t, body)},v1=${mac(OLD_SECRET, t, body)}`))).status).toBe(200);
    expect((await post(body, sig(`t=${t},v1=${mac(OLD_SECRET, t, body)},v1=${mac(SECRET, t, body)}`))).status).toBe(200);
  });

  it('ignores other schemes such as v0', async () => {
    const body = event('open');
    const t = now();
    const good = mac(SECRET, t, body);
    expect((await post(body, sig(`t=${t},v0=${good}`))).status).toBe(401);
    expect((await post(body, sig(`t=${t},v0=${'0'.repeat(64)},v1=${good}`))).status).toBe(200);
  });

  it('accepts uppercase hex', async () => {
    const body = event('open');
    const t = now();
    expect((await post(body, sig(`t=${t},v1=${mac(SECRET, t, body).toUpperCase()}`))).status).toBe(200);
  });

  it('signs the t string exactly as sent (no numeric re-formatting)', async () => {
    const body = event('open');
    const t = '0001492774578';
    expect((await post(body, sig(`t=${t},v1=${mac(SECRET, t, body)}`))).status).toBe(200);
  });

  it('verifies the exact bytes, including non-ASCII and whitespace', async () => {
    const body = '{"type":"open",  "open":{"email":"zoë@example.com"}}\n';
    expect((await post(body, sig(sign(body)))).status).toBe(200);
  });

  it('accepts any content type', async () => {
    const body = event('open');
    expect((await post(body, sig(sign(body)), 'text/plain')).status).toBe(200);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = event('bounce');
    expect((await post(body, sig(sign(body, { secret: 'wrong_secret' })))).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    expect((await post(event('complaint'), sig(sign(event('open'))))).status).toBe(401);
  });

  it('rejects a tampered timestamp', async () => {
    const body = event('open');
    const header = sign(body).replace(/t=\d+/, `t=${now() + 1}`);
    expect((await post(body, sig(header))).status).toBe(401);
  });

  it('rejects a missing or empty signature header', async () => {
    expect((await post(event('open'))).status).toBe(401);
    expect((await post(event('open'), sig(''))).status).toBe(401);
  });

  it('rejects a header without t', async () => {
    const body = event('open');
    const header = `v1=${crypto.createHmac('sha256', SECRET).update(`.${body}`).digest('hex')}`;
    expect((await post(body, sig(header))).status).toBe(401);
  });

  it.each([
    'garbage',
    't=abc,v1=deadbeef',
    't=123',
    'v1=deadbeef',
    't=123,v1=short',
    `t=123,v1=${'z'.repeat(64)}`,
    `t=123,v1=${'a'.repeat(63)}`,
    `t=123,v1=${'a'.repeat(65)}`,
  ])('rejects malformed header %j without throwing', async (header) => {
    expect((await post(event('open'), sig(header))).status).toBe(401);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.BIGMAILER_WEBHOOK_SECRET;
    const body = event('open');
    expect((await post(body, sig(sign(body)))).status).toBe(500);
  });
});

describe('BigMailer timestamp tolerance (opt-in)', () => {
  const old = now() - 3600;

  it('is off by default: an hour-old timestamp with a valid signature is accepted', async () => {
    const body = event('open');
    expect((await post(body, sig(sign(body, { timestamp: old })))).status).toBe(200);
  });

  it('rejects old timestamps when BIGMAILER_WEBHOOK_TOLERANCE_SECONDS is positive', async () => {
    process.env.BIGMAILER_WEBHOOK_TOLERANCE_SECONDS = '300';
    const body = event('open');
    expect((await post(body, sig(sign(body, { timestamp: old })))).status).toBe(401);
  });

  it('accepts fresh timestamps when the tolerance is set', async () => {
    process.env.BIGMAILER_WEBHOOK_TOLERANCE_SECONDS = '300';
    const body = event('open');
    expect((await post(body, sig(sign(body)))).status).toBe(200);
  });

  it('treats a non-numeric value as off', async () => {
    process.env.BIGMAILER_WEBHOOK_TOLERANCE_SECONDS = 'five minutes';
    const body = event('open');
    expect((await post(body, sig(sign(body, { timestamp: old })))).status).toBe(200);
  });
});

describe('BigMailer event handling', () => {
  it.each(['bounce', 'click', 'complaint', 'open', 'unsubscribe'])('handles %s', async (type) => {
    const body = event(type);
    const res = await post(body, sig(sign(body)));
    expect(res.status).toBe(200);
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled'));
  });

  it('reads the bounce kind from bounce.type, not the event type', async () => {
    const body = event('bounce');
    await post(body, sig(sign(body)));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Bounce (hard) for test@example.com'));
  });

  it('acknowledges unhandled events', async () => {
    const body = JSON.stringify({ type: 'delivery', brand_id: ids.brand_id });
    const res = await post(body, sig(sign(body)));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Unhandled event: delivery');
  });

  it('rejects a validly signed body that is not JSON', async () => {
    const body = 'not json';
    expect((await post(body, sig(sign(body)))).status).toBe(400);
  });

  it.each(['[]', 'null', '"text"', '42'])('rejects a validly signed non-object body %s', async (body) => {
    expect((await post(body, sig(sign(body)))).status).toBe(400);
  });

  it.each([
    { type: 'open', open: 'oops' },
    { type: 'open', open: null },
    { type: 'open', open: [] },
    { type: 'click', click: 5 },
    { type: 'unsubscribe', unsubscribe: { unsubscribe_ids: 'nope', unsubscribe_all: 'yes' } },
    { type: 'bounce', bounce: { type: { nested: true }, email: ['x'] } },
    { type: 42 },
    { type: null },
    {},
  ])('does not 500 on wrong-typed fields %j', async (payload) => {
    const body = JSON.stringify(payload);
    const res = await post(body, sig(sign(body)));
    expect(res.status).toBe(200);
  });
});
