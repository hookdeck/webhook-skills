import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// The Webhook Secret Key is used as-is, as UTF-8; this one is only for tests
const SECRET = 'test_xtremepush_webhook_secret_key_5c1e';

type Handler = (request: NextRequest) => Promise<Response>;
let route: Record<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', Handler>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  process.env.XTREMEPUSH_WEBHOOK_SECRET = SECRET;
  route = await import('../app/webhooks/xtremepush/route');
});

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.XTREMEPUSH_WEBHOOK_TOLERANCE_SECONDS;
  process.env.XTREMEPUSH_WEBHOOK_SECRET = SECRET;
  vi.restoreAllMocks();
});

const now = () => String(Math.floor(Date.now() / 1000));

function v1For(body: string, t: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(`${t}.`).update(body).digest('hex');
}

// Xtremepush separates entries with a comma and a space: t=<unix>, v1=<hex>
function sign(body: string, t = now(), secret = SECRET): string {
  return `t=${t}, v1=${v1For(body, t, secret)}`;
}

// Content-Type is deliberately varied: verification must not depend on it
function send(
  method: keyof typeof route,
  body: string | undefined,
  signature?: string,
  contentType: string | null = 'application/json'
) {
  const headers: Record<string, string> = {};
  if (contentType) headers['content-type'] = contentType;
  if (signature !== undefined) headers['x-xtremepush-signature'] = signature;
  const init: { method: string; headers: Record<string, string>; body?: string } = { method, headers };
  if (body !== undefined && method !== 'GET') init.body = body;
  return route[method](new NextRequest('http://localhost:3000/webhooks/xtremepush', init));
}
const post = (body: string, signature?: string, contentType?: string | null) =>
  send('POST', body, signature, contentType);

const messageSend = JSON.stringify({
  event: 'message_send',
  time: 1689343556,
  properties: { campaign_id: 12, user_id: 'u-1' },
});
const messageDelivery = JSON.stringify({
  event: 'message_delivery',
  time: 1689343560,
  properties: { campaign_id: 12, user_id: 'u-1' },
});

describe('Xtremepush webhook signature verification', () => {
  it('accepts a valid X-Xtremepush-Signature', async () => {
    const res = await post(messageSend, sign(messageSend));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts the header without a space after the comma', async () => {
    const t = now();
    expect((await post(messageSend, `t=${t},v1=${v1For(messageSend, t)}`)).status).toBe(200);
  });

  it('accepts extra whitespace between entries', async () => {
    const t = now();
    expect((await post(messageSend, `t=${t},  v1=${v1For(messageSend, t)}`)).status).toBe(200);
  });

  it('verifies regardless of Content-Type', async () => {
    expect((await post(messageSend, sign(messageSend), 'text/plain')).status).toBe(200);
    expect((await post(messageSend, sign(messageSend), 'application/octet-stream')).status).toBe(200);
  });

  it('signs t exactly as it appears in the header', async () => {
    // Re-formatting t as a number would drop the leading zero and break the signature
    expect((await post(messageSend, sign(messageSend, '01689343556'))).status).toBe(200);
  });

  it('accepts when any v1 matches (key rotation)', async () => {
    const t = now();
    const header = `t=${t}, v1=${v1For(messageSend, t, 'old_secret')}, v1=${v1For(messageSend, t)}`;
    expect((await post(messageSend, header)).status).toBe(200);
  });

  it('accepts uppercase hex', async () => {
    const t = now();
    expect((await post(messageSend, `t=${t}, v1=${v1For(messageSend, t).toUpperCase()}`)).status).toBe(200);
  });

  it('ignores keys other than t and v1', async () => {
    const t = now();
    expect((await post(messageSend, `t=${t}, v0=${v1For(messageSend, t)}`)).status).toBe(401);
    expect((await post(messageSend, `${sign(messageSend)}, v0=ignored`)).status).toBe(200);
  });

  it('rejects a missing or empty signature header', async () => {
    expect((await post(messageSend)).status).toBe(401);
    expect((await post(messageSend, '')).status).toBe(401);
  });

  it('rejects a header with no t or no v1', async () => {
    const t = now();
    expect((await post(messageSend, `v1=${v1For(messageSend, t)}`)).status).toBe(401);
    expect((await post(messageSend, `t=${t}`)).status).toBe(401);
    expect((await post(messageSend, `t=, v1=${v1For(messageSend, t)}`)).status).toBe(401);
  });

  it('rejects a malformed v1 before decoding it', async () => {
    const t = now();
    const good = v1For(messageSend, t);
    expect((await post(messageSend, `t=${t}, v1=${good.slice(0, 63)}`)).status).toBe(401);
    expect((await post(messageSend, `t=${t}, v1=${good}00`)).status).toBe(401);
    expect((await post(messageSend, `t=${t}, v1=${'zz' + good.slice(2)}`)).status).toBe(401);
    expect((await post(messageSend, `t=${t}, v1=`)).status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    expect((await post(messageSend, sign(messageSend, now(), 'wrong_secret'))).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    expect((await post(messageSend.replace('u-1', 'u-2'), sign(messageSend))).status).toBe(401);
  });

  it('rejects a re-serialised body (the raw bytes are signed)', async () => {
    const pretty = JSON.stringify(JSON.parse(messageSend), null, 2);
    expect((await post(pretty, sign(messageSend))).status).toBe(401);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.XTREMEPUSH_WEBHOOK_SECRET;
    expect((await post(messageSend, sign(messageSend))).status).toBe(500);
  });
});

describe('Xtremepush timestamp window (opt-in)', () => {
  const old = () => String(Math.floor(Date.now() / 1000) - 3600);

  it('does not reject old timestamps by default', async () => {
    expect((await post(messageSend, sign(messageSend, old()))).status).toBe(200);
  });

  it('treats 0 as off', async () => {
    process.env.XTREMEPUSH_WEBHOOK_TOLERANCE_SECONDS = '0';
    expect((await post(messageSend, sign(messageSend, old()))).status).toBe(200);
  });

  it('rejects old timestamps when a tolerance is set', async () => {
    process.env.XTREMEPUSH_WEBHOOK_TOLERANCE_SECONDS = '300';
    expect((await post(messageSend, sign(messageSend, old()))).status).toBe(401);
    expect((await post(messageSend, sign(messageSend))).status).toBe(200);
  });

  it('rejects a non-numeric t when a tolerance is set', async () => {
    process.env.XTREMEPUSH_WEBHOOK_TOLERANCE_SECONDS = '300';
    expect((await post(messageSend, sign(messageSend, 'abc'))).status).toBe(401);
  });

  it('treats an invalid tolerance as off', async () => {
    process.env.XTREMEPUSH_WEBHOOK_TOLERANCE_SECONDS = 'five minutes';
    expect((await post(messageSend, sign(messageSend, old()))).status).toBe(200);
  });
});

describe('Xtremepush methods and bodies', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'] as const)('accepts a signed %s', async (method) => {
    expect((await send(method, messageSend, sign(messageSend))).status).toBe(200);
  });

  it('verifies a GET with no body over zero bytes and acknowledges it', async () => {
    const res = await send('GET', undefined, sign(''), null);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('rejects an unsigned GET', async () => {
    expect((await send('GET', undefined, undefined, null)).status).toBe(401);
  });

  it('rejects a GET whose signature covers a different body', async () => {
    expect((await send('GET', undefined, sign(messageSend), null)).status).toBe(401);
  });

  it('answers 400 to a verified body that is not JSON', async () => {
    const body = 'not json';
    expect((await post(body, sign(body), 'text/plain')).status).toBe(400);
  });
});

describe('Xtremepush event handling', () => {
  const logged = () => logSpy.mock.calls.map((c) => String(c[0])).join('\n');

  it('handles message_send', async () => {
    expect((await post(messageSend, sign(messageSend))).status).toBe(200);
    expect(logged()).toContain('message_send');
  });

  it('handles message_delivery', async () => {
    expect((await post(messageDelivery, sign(messageDelivery))).status).toBe(200);
    expect(logged()).toContain('message_delivery');
  });

  it('acknowledges unknown events', async () => {
    const body = JSON.stringify({ event: 'message_open', time: 1, properties: {} });
    expect((await post(body, sign(body))).status).toBe(200);
    expect(logged()).toContain('Unhandled Xtremepush event: message_open');
  });

  it('acknowledges a customised body with no event field', async () => {
    const body = JSON.stringify({ type: 'sent', user: 'u-1' });
    expect((await post(body, sign(body))).status).toBe(200);
    expect(logged()).toContain('Unhandled Xtremepush event: undefined');
  });

  it.each([
    ['event is a number', { event: 5, properties: {} }],
    ['event is an object', { event: { name: 'message_send' } }],
    ['properties is a string', { event: 'message_send', properties: 'oops' }],
    ['properties is an array', { event: 'message_delivery', properties: [1, 2] }],
    ['properties is null', { event: 'message_send', properties: null }],
    ['body is an array', [{ event: 'message_send' }]],
    ['body is null', null],
    ['body is a string', 'message_send'],
  ])('does not fail when %s', async (_name, value) => {
    const body = JSON.stringify(value);
    expect((await post(body, sign(body))).status).toBe(200);
  });
});
