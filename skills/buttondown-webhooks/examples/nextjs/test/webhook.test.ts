import { describe, it, expect, beforeAll, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// The signing key is any string you choose in the Buttondown webhook settings.
// It is used as-is (UTF-8), not decoded. This one is only for tests.
const SECRET = 'test_buttondown_signing_key_long_and_random';

let POST: (request: NextRequest) => Promise<Response>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  process.env.BUTTONDOWN_WEBHOOK_SECRET = SECRET;
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  ({ POST } = await import('../app/webhooks/buttondown/route'));
});

function hexFor(body: string, secret: string | Buffer = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

const sign = (body: string, secret: string | Buffer = SECRET) => `sha256=${hexFor(body, secret)}`;

// Content-Type is deliberately varied: verification must not depend on it
function post(body: string, signature?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature !== undefined) headers['x-buttondown-signature'] = signature;
  return POST(new NextRequest('http://localhost:3000/webhooks/buttondown', { method: 'POST', headers, body }));
}

const payload = (eventType: string, data: Record<string, unknown>) =>
  JSON.stringify({ event_type: eventType, data });
const ids = {
  newsletter: '13121cd6-0dfc-424c-bb12-988b0a32fcb3',
  subscriber: 'ac79483b-cd28-49c1-982e-8a88e846d7e7',
};

// Shape from Buttondown's documentation
const confirmed = payload('subscriber.confirmed', ids);

describe('Buttondown webhook signature verification', () => {
  it('accepts a valid sha256= signature', async () => {
    const res = await post(confirmed, sign(confirmed));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts the bare digest without the prefix', async () => {
    expect((await post(confirmed, hexFor(confirmed))).status).toBe(200);
  });

  it('accepts uppercase hex', async () => {
    expect((await post(confirmed, `sha256=${hexFor(confirmed).toUpperCase()}`)).status).toBe(200);
  });

  it('verifies regardless of Content-Type', async () => {
    expect((await post(confirmed, sign(confirmed), 'text/plain')).status).toBe(200);
  });

  it('verifies the exact bytes, including unusual whitespace and key order', async () => {
    const body = '{ "data" : {"subscriber":"s1",  "newsletter":"n1"},\n"event_type":"subscriber.created" }';
    expect((await post(body, sign(body))).status).toBe(200);
  });

  it('uses the signing key as plain UTF-8, not hex or base64 decoded', async () => {
    const key = crypto.randomBytes(16).toString('hex');
    process.env.BUTTONDOWN_WEBHOOK_SECRET = key;
    try {
      expect((await post(confirmed, sign(confirmed, key))).status).toBe(200);
      expect((await post(confirmed, sign(confirmed, Buffer.from(key, 'hex')))).status).toBe(401);
      expect((await post(confirmed, sign(confirmed, Buffer.from(key, 'base64')))).status).toBe(401);
    } finally {
      process.env.BUTTONDOWN_WEBHOOK_SECRET = SECRET;
    }
  });

  it('rejects a missing or empty signature header', async () => {
    expect((await post(confirmed, undefined)).status).toBe(401);
    expect((await post(confirmed, '')).status).toBe(401);
    expect((await post(confirmed, 'sha256=')).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    expect((await post(confirmed.replace('ac79', 'bc79'), sign(confirmed))).status).toBe(401);
  });

  it('rejects a signature made with the wrong key', async () => {
    expect((await post(confirmed, sign(confirmed, 'another_key'))).status).toBe(401);
  });

  it('rejects malformed signatures without throwing', async () => {
    const good = hexFor(confirmed);
    expect((await post(confirmed, 'sha256=abc')).status).toBe(401);
    expect((await post(confirmed, `sha256=${good}00`)).status).toBe(401);
    // 64 chars but not hex: Buffer.from(x, 'hex') would silently truncate it
    expect((await post(confirmed, `sha256=${'zz'.repeat(32)}`)).status).toBe(401);
    expect((await post(confirmed, 'garbage')).status).toBe(401);
  });

  it('rejects a v1= or sha1= prefixed value', async () => {
    expect((await post(confirmed, `v1=${hexFor(confirmed)}`)).status).toBe(401);
    expect((await post(confirmed, `sha1=${hexFor(confirmed)}`)).status).toBe(401);
  });
});

describe('Buttondown events (dispatch on event_type)', () => {
  it.each([
    ['subscriber.created', ids],
    ['subscriber.confirmed', ids],
    ['subscriber.unsubscribed', ids],
    ['email.sent', { newsletter: ids.newsletter, email: 'e1' }],
    ['automation.invoked', { newsletter: ids.newsletter }],
    ['subscriber.paid', ids],
  ])('handles %s', async (eventType, data) => {
    const body = payload(eventType, data);
    logSpy.mockClear();
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    const logged = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    if (eventType === 'subscriber.paid') expect(logged).toContain(`Unhandled event: ${eventType}`);
    else expect(logged).not.toContain('Unhandled');
  });

  it('rejects verified but invalid JSON', async () => {
    const body = '{not json';
    expect((await post(body, sign(body))).status).toBe(400);
  });
});
