import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// The Signing Secret is an opaque string used as-is; this one is only for tests
const SECRET = 'test_zigpoll_signing_secret_5b2e';


let POST: (request: NextRequest) => Promise<Response>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  process.env.ZIGPOLL_WEBHOOK_SECRET = SECRET;
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  ({ POST } = await import('../app/webhooks/zigpoll/route'));
});

afterEach(() => {
  delete process.env.ZIGPOLL_TIMESTAMP_TOLERANCE_SECONDS;
  logSpy.mockClear();
});

function v1Of(body: string, t: number, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
}

// t is unix milliseconds
function sign(body: string, t = Date.now(), secret = SECRET) {
  return `t=${t},v1=${v1Of(body, t, secret)}`;
}

// Content-Type is deliberately varied: verification must not depend on it
function post(body: string, signature?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature !== undefined) headers['x-zigpoll-signature'] = signature;
  return POST(new NextRequest('http://localhost:3000/webhooks/zigpoll', { method: 'POST', headers, body }));
}

const submitted = JSON.stringify({
  type: 'submitted-responses',
  accountId: 'acc_1',
  pollId: 'poll_1',
  participantId: 'p_1',
  metadata: {},
  responses: { q1: 'Great' },
  submissionsComplete: false,
  timestamp: 1754400000000,
  email: 'jane@example.com',
  emails: ['jane@example.com'],
});

describe('Zigpoll webhook signature verification', () => {
  it('accepts a valid X-Zigpoll-Signature', async () => {
    const res = await post(submitted, sign(submitted));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies regardless of Content-Type', async () => {
    expect((await post(submitted, sign(submitted), 'text/plain')).status).toBe(200);
  });

  it('allows a space after the comma and uppercase hex', async () => {
    const t = Date.now();
    const header = `t=${t}, v1=${v1Of(submitted, t).toUpperCase()}`;
    expect((await post(submitted, header)).status).toBe(200);
  });

  it('accepts when any v1 matches (defensive parsing)', async () => {
    const t = Date.now();
    const header = `t=${t},v1=${v1Of(submitted, t, 'old_secret')},v1=${v1Of(submitted, t)}`;
    expect((await post(submitted, header)).status).toBe(200);
  });

  it('rejects a missing signature header', async () => {
    expect((await post(submitted, undefined)).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    expect((await post(submitted.replace('Great', 'Awful'), sign(submitted))).status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    expect((await post(submitted, sign(submitted, undefined, 'other_secret'))).status).toBe(401);
  });

  it('rejects a v1 that is not 64 hex chars without throwing', async () => {
    expect((await post(submitted, 't=1754400000000,v1=abc')).status).toBe(401);
    expect((await post(submitted, `t=1754400000000,v1=${'zz'.repeat(32)}`)).status).toBe(401);
  });

  it('rejects a header with no t or no v1', async () => {
    expect((await post(submitted, 'garbage')).status).toBe(401);
    expect((await post(submitted, `v1=${v1Of(submitted, 1)}`)).status).toBe(401);
    expect((await post(submitted, 't=1754400000000')).status).toBe(401);
    expect((await post(submitted, 't=abc,v1=deadbeef')).status).toBe(401);
  });

  it('rejects when the timestamp was altered after signing', async () => {
    const header = sign(submitted, 1754400000000).replace('t=1754400000000', 't=1754400000001');
    expect((await post(submitted, header)).status).toBe(401);
  });

  it('accepts an old timestamp by default (Hookdeck retries and replays keep the original)', async () => {
    expect((await post(submitted, sign(submitted, Date.now() - 3600 * 1000))).status).toBe(200);
  });

  it('treats t as milliseconds when ZIGPOLL_TIMESTAMP_TOLERANCE_SECONDS is set', async () => {
    process.env.ZIGPOLL_TIMESTAMP_TOLERANCE_SECONDS = '300';
    try {
      expect((await post(submitted, sign(submitted, Date.now() - 3600 * 1000))).status).toBe(401);
      expect((await post(submitted, sign(submitted, Date.now() - 60 * 1000))).status).toBe(200);
      expect((await post(submitted, sign(submitted))).status).toBe(200);
    } finally {
      delete process.env.ZIGPOLL_TIMESTAMP_TOLERANCE_SECONDS;
    }
  });

  it('treats a non-numeric ZIGPOLL_TIMESTAMP_TOLERANCE_SECONDS as 0 (check off)', async () => {
    process.env.ZIGPOLL_TIMESTAMP_TOLERANCE_SECONDS = 'five minutes';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect((await post(submitted, sign(submitted, Date.now() - 3600 * 1000))).status).toBe(200);
    } finally {
      delete process.env.ZIGPOLL_TIMESTAMP_TOLERANCE_SECONDS;
      warn.mockRestore();
    }
  });
});

describe('Zigpoll events', () => {
  it.each(['submitted-responses', 'completed-survey'])('handles %s', async (type) => {
    const body = JSON.stringify({ type, pollId: 'poll_1', participantId: 'p_1', submissionsComplete: type === 'completed-survey' });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      expect(log.mock.calls.map((c) => c[0]).join('\n')).not.toContain('Unhandled');
    } finally {
      log.mockRestore();
    }
  });

  it('acknowledges an unknown type', async () => {
    const body = JSON.stringify({ type: 'something-else' });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      expect((await post(body, sign(body))).status).toBe(200);
      expect(log.mock.calls.map((c) => c[0]).join('\n')).toContain('Unhandled event: something-else');
    } finally {
      log.mockRestore();
    }
  });

  it('rejects verified but invalid JSON', async () => {
    const body = '{not json';
    expect((await post(body, sign(body))).status).toBe(400);
  });
});
