import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Nooks signing keys look like nooks-webhook-signing-key-...; used as-is. This one is only for tests
const SECRET = 'nooks-webhook-signing-key-test8f3a1c';

let POST: (request: NextRequest) => Promise<Response>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  process.env.NOOKS_WEBHOOK_SECRET = SECRET;
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  ({ POST } = await import('../app/webhooks/nooks/route'));
});

afterEach(() => {
  delete process.env.NOOKS_TIMESTAMP_TOLERANCE_SECONDS;
  logSpy.mockClear();
});

// t is Unix milliseconds; s is base64 HMAC-SHA256 of "<t>.<raw body>"
function sign(body: string, timestamp = Date.now(), secret = SECRET): string {
  const s = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('base64');
  return `t=${timestamp},s=${s}`;
}

// Content-Type is deliberately varied: verification must not depend on it
function post(body: string, signature?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature !== undefined) headers['x-webhook-signature'] = signature;
  return POST(new NextRequest('http://localhost:3000/webhooks/nooks', { method: 'POST', headers, body }));
}

const callLogged = JSON.stringify({
  event: 'call.logged',
  eventId: 'ed573041-57e9-4ef6-9976-bb759761c2a7-#-22216d73-1351-4e4b-ae0c-64d7fc46b8c1',
  occurredAt: '2025-12-09T04:06:36.145Z',
  callData: {
    callId: 'ed573041-57e9-4ef6-9976-bb759761c2a7',
    workspaceId: 'cUvwa9fcNtE1G7vy',
    status: 'completed',
    userData: { userId: 'test-user-id', email: 'test-user-email', name: 'test-user-name' },
    prospectData: { prospectId: '0056s00000D1gRtAAJ', name: 'Jane Smith', phoneNumber: '+14155551234', email: 'jane.smith@acme.com', linkedInUrl: null },
    accountData: { accountId: 'test-account-id', name: 'test-account-name' },
    callDirection: 'inbound',
    disposition: { id: 'test-disposition-id', name: 'Connected' },
    startedAt: '2025-12-09T02:54:29.170Z',
    durationSeconds: 100,
    recordingUrl: null,
    notes: null,
    transcriptUrl: null,
    sequenceData: null,
  },
});

describe('Nooks webhook signature verification', () => {
  it('accepts a valid x-webhook-signature and handles call.logged', async () => {
    const res = await post(callLogged, sign(callLogged));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Call ed573041-57e9-4ef6-9976-bb759761c2a7 logged: completed'));
  });

  it('verifies regardless of Content-Type', async () => {
    const res = await post(callLogged, sign(callLogged), 'text/plain');
    expect(res.status).toBe(200);
  });

  it('accepts a signature that ends in "=" padding (split on the first "=" only)', async () => {
    let body = '';
    let header = '';
    for (let i = 0; ; i++) {
      body = JSON.stringify({ event: 'call.logged', n: i });
      header = sign(body);
      if (header.endsWith('=')) break;
    }
    const res = await post(body, header);
    expect(res.status).toBe(200);
  });

  it('rejects an unsigned request by default', async () => {
    const res = await post(callLogged, undefined);
    expect(res.status).toBe(401);
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Call '));
  });

  it('acknowledges an unsigned activation ping without processing it when NOOKS_ACCEPT_UNSIGNED_PING=true', async () => {
    process.env.NOOKS_ACCEPT_UNSIGNED_PING = 'true';
    delete process.env.NOOKS_WEBHOOK_SECRET; // no signing key exists before activation
    try {
      const res = await post(callLogged, undefined);
      expect(res.status).toBe(200);
      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Call '));
    } finally {
      delete process.env.NOOKS_ACCEPT_UNSIGNED_PING;
      process.env.NOOKS_WEBHOOK_SECRET = SECRET;
    }
  });

  it('still verifies signed requests when NOOKS_ACCEPT_UNSIGNED_PING=true', async () => {
    process.env.NOOKS_ACCEPT_UNSIGNED_PING = 'true';
    try {
      const res = await post(callLogged, sign(callLogged, undefined, 'other_key'));
      expect(res.status).toBe(401);
    } finally {
      delete process.env.NOOKS_ACCEPT_UNSIGNED_PING;
    }
  });

  it('rejects a tampered body', async () => {
    const res = await post(callLogged.replace('completed', 'failed'), sign(callLogged));
    expect(res.status).toBe(401);
  });

  it('rejects a signature made with the wrong key', async () => {
    const res = await post(callLogged, sign(callLogged, undefined, 'other_key'));
    expect(res.status).toBe(401);
  });

  it('rejects malformed headers', async () => {
    for (const header of ['garbage', 't=123', 's=abc', 't=abc,s=abc', 't=,s=', ',,,', 't=1e3,s=abc']) {
      const res = await post(callLogged, header);
      expect(res.status).toBe(401);
    }
  });

  it('rejects a signature with the wrong length without throwing', async () => {
    const res = await post(callLogged, `t=${Date.now()},s=AAAA`);
    expect(res.status).toBe(401);
  });

  it('does not leniently decode the header (extra base64 text is a mismatch)', async () => {
    const res = await post(callLogged, `${sign(callLogged)}AAAA`);
    expect(res.status).toBe(401);
  });

  it('rejects a non-ASCII signature with 401', async () => {
    // Header values are ByteStrings; use a Latin-1 character so the Request can be constructed
    const res = await post(callLogged, `t=${Date.now()},s=ñandú`);
    expect(res.status).toBe(401);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const res = await post('not json', sign('not json'));
    expect(res.status).toBe(400);
  });

  it('handles a validly signed JSON null body without a 500', async () => {
    const res = await post('null', sign('null'));
    expect(res.status).toBe(200);
  });

  it('logs unhandled event names', async () => {
    const body = JSON.stringify({ event: 'something.else' });
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Unhandled event: something.else');
  });
});

describe('Timestamp window (opt-in)', () => {
  const hourAgo = () => Date.now() - 60 * 60 * 1000;

  it('is off by default: an hour-old (retried) timestamp still verifies', async () => {
    const res = await post(callLogged, sign(callLogged, hourAgo()));
    expect(res.status).toBe(200);
  });

  it('rejects an old timestamp once a tolerance is set', async () => {
    process.env.NOOKS_TIMESTAMP_TOLERANCE_SECONDS = '300';
    const res = await post(callLogged, sign(callLogged, hourAgo()));
    expect(res.status).toBe(401);
  });

  it('treats t as milliseconds: a fresh ms timestamp passes a 300 s window', async () => {
    process.env.NOOKS_TIMESTAMP_TOLERANCE_SECONDS = '300';
    const res = await post(callLogged, sign(callLogged, Date.now() - 60 * 1000));
    expect(res.status).toBe(200);
  });

  it('a widened window accepts the hour-old timestamp', async () => {
    process.env.NOOKS_TIMESTAMP_TOLERANCE_SECONDS = '86400';
    const res = await post(callLogged, sign(callLogged, hourAgo()));
    expect(res.status).toBe(200);
  });

  it('treats an invalid tolerance as off', async () => {
    process.env.NOOKS_TIMESTAMP_TOLERANCE_SECONDS = 'five minutes';
    const res = await post(callLogged, sign(callLogged, hourAgo()));
    expect(res.status).toBe(200);
  });
});

describe('Configuration', () => {
  it('returns 500 when the signing key is not configured', async () => {
    delete process.env.NOOKS_WEBHOOK_SECRET;
    const res = await post(callLogged, sign(callLogged));
    process.env.NOOKS_WEBHOOK_SECRET = SECRET;
    expect(res.status).toBe(500);
  });
});
