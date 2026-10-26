import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Sublime webhook Action signing secrets are opaque strings; this one is only for tests
const SECRET = 'test_sublime_secret_5f0c1a7e';

let POST: (request: NextRequest) => Promise<Response>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  process.env.SUBLIME_SECURITY_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/sublime-security/route'));
});

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  delete process.env.SUBLIME_SECURITY_TIMESTAMP_TOLERANCE_SECONDS;
  process.env.SUBLIME_SECURITY_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const now = () => Math.floor(Date.now() / 1000);

const hmac = (timestamp: number | string, body: string, secret = SECRET) =>
  crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');

// Matches Sublime's header format: "t=<unix seconds>,v0=<hex>" (no space)
function sign(
  body: string,
  { timestamp = now(), secret = SECRET }: { timestamp?: number; secret?: string } = {}
): string {
  return `t=${timestamp},v0=${hmac(timestamp, body, secret)}`;
}

// Based on the message.flagged sample in Sublime's webhook docs
function event(type = 'message.flagged'): string {
  return JSON.stringify({
    id: '5e02026c-55c1-4cbb-8a18-76eb2f3e06d3',
    api_version: '0',
    created_at: '2021-06-30T16:17:22.937642Z',
    type,
    data: {
      message: {
        id: 'dff3be1d-b348-4dab-bb60-582842909a88',
        canonical_id: '767f6519458092af9994a79ae73ca055e1365618',
        external_id: '17a5db5ea7fa760d',
        message_source_id: 'a5843e7d-4ba5-40df-954e-73cb2f1e3e7e',
        mailbox: { id: 'f0654b68-2686-491e-8fcb-e4ad61c61ad8', external_id: '109412126579921477721' },
      },
      classification: 'malicious',
      flagged_rules: [
        {
          id: '756b841c-4560-49b3-a8c0-dbacb2900aa5',
          name: 'Brand impersonation: Internal Revenue Service',
          severity: 'high',
          tags: ['brand-impersonation', 'suspicious-sender'],
        },
      ],
      triggered_actions: [{ id: '6f45c807-a9c7-47a8-8c3e-5391e4f477ca', name: 'Auto-trash', type: 'trash_message' }],
    },
  });
}

function post(body: string, headers: Record<string, string> = {}, contentType = 'application/json') {
  return POST(
    new NextRequest('http://localhost:3000/webhooks/sublime-security', {
      method: 'POST',
      headers: { 'content-type': contentType, ...headers },
      body,
    })
  );
}

describe('Sublime Security webhook signature verification', () => {
  it('accepts a valid v0 signature', async () => {
    const body = event();
    const res = await post(body, { 'X-Sublime-Signature': sign(body) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts a match on any v0 value', async () => {
    const body = event();
    const ts = now();
    const res = await post(body, { 'X-Sublime-Signature': `t=${ts},v0=${'0'.repeat(64)},v0=${hmac(ts, body)}` });
    expect(res.status).toBe(200);
  });

  it('accepts uppercase hex', async () => {
    const body = event();
    const ts = now();
    const res = await post(body, { 'X-Sublime-Signature': `t=${ts},v0=${hmac(ts, body).toUpperCase()}` });
    expect(res.status).toBe(200);
  });

  it('ignores unknown signature schemes', async () => {
    const body = event();
    const ts = now();
    const res = await post(body, { 'X-Sublime-Signature': `t=${ts},v1=${hmac(ts, body)}` });
    expect(res.status).toBe(401);
  });

  it('accepts any content type', async () => {
    const body = event();
    const res = await post(body, { 'X-Sublime-Signature': sign(body) }, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = event();
    const res = await post(body, { 'X-Sublime-Signature': sign(body, { secret: 'wrong_secret' }) });
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const res = await post(event('manual'), { 'X-Sublime-Signature': sign(event('message.flagged')) });
    expect(res.status).toBe(401);
  });

  it('rejects a tampered timestamp', async () => {
    const body = event();
    const res = await post(body, { 'X-Sublime-Signature': sign(body).replace(/t=\d+/, `t=${now() + 1}`) });
    expect(res.status).toBe(401);
  });

  it('rejects a missing signature header', async () => {
    const res = await post(event());
    expect(res.status).toBe(401);
  });

  it('rejects a 64-character signature that is not hex', async () => {
    const res = await post(event(), { 'X-Sublime-Signature': `t=${now()},v0=${'z'.repeat(64)}` });
    expect(res.status).toBe(401);
  });

  it('rejects a valid signature with extra trailing characters', async () => {
    const body = event();
    const ts = now();
    const res = await post(body, { 'X-Sublime-Signature': `t=${ts},v0=${hmac(ts, body)}zz` });
    expect(res.status).toBe(401);
  });

  it.each(['0', '-5', '1.5', '+12', ' ', 'abc'])('rejects timestamp %j', async (t) => {
    const body = event();
    const res = await post(body, { 'X-Sublime-Signature': `t=${t},v0=${hmac(t, body)}` });
    expect(res.status).toBe(401);
  });

  it.each(['garbage', 't=abc,v0=deadbeef', 't=123', 'v0=deadbeef', 't=123,v0=short'])(
    'rejects malformed header %j without throwing',
    async (header) => {
      const res = await post(event(), { 'X-Sublime-Signature': header });
      expect(res.status).toBe(401);
    }
  );

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.SUBLIME_SECURITY_WEBHOOK_SECRET;
    const body = event();
    const res = await post(body, { 'X-Sublime-Signature': sign(body) });
    expect(res.status).toBe(500);
  });
});

describe('timestamp tolerance (opt-in)', () => {
  const old = now() - 3600;

  it('is off by default: an hour-old timestamp with a valid signature is accepted', async () => {
    const body = event();
    const res = await post(body, { 'X-Sublime-Signature': sign(body, { timestamp: old }) });
    expect(res.status).toBe(200);
  });

  it('rejects old timestamps when SUBLIME_SECURITY_TIMESTAMP_TOLERANCE_SECONDS is positive', async () => {
    process.env.SUBLIME_SECURITY_TIMESTAMP_TOLERANCE_SECONDS = '300';
    const body = event();
    const res = await post(body, { 'X-Sublime-Signature': sign(body, { timestamp: old }) });
    expect(res.status).toBe(401);
  });

  it('accepts fresh timestamps when the tolerance is set', async () => {
    process.env.SUBLIME_SECURITY_TIMESTAMP_TOLERANCE_SECONDS = '300';
    const body = event();
    const res = await post(body, { 'X-Sublime-Signature': sign(body) });
    expect(res.status).toBe(200);
  });

  it.each(['five minutes', '-1', '1.5'])('treats %j as off', async (value) => {
    process.env.SUBLIME_SECURITY_TIMESTAMP_TOLERANCE_SECONDS = value;
    const body = event();
    const res = await post(body, { 'X-Sublime-Signature': sign(body, { timestamp: old }) });
    expect(res.status).toBe(200);
  });
});

describe('event handling', () => {
  it.each(['message.flagged', 'group', 'manual'])('handles %s', async (type) => {
    const body = event(type);
    const res = await post(body, { 'X-Sublime-Signature': sign(body) });
    expect(res.status).toBe(200);
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled'));
  });

  it('acknowledges unhandled types', async () => {
    const body = event('something.new');
    const res = await post(body, { 'X-Sublime-Signature': sign(body) });
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Unhandled event type: something.new');
  });

  it('rejects a validly signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await post(body, { 'X-Sublime-Signature': sign(body) });
    expect(res.status).toBe(400);
  });
});
