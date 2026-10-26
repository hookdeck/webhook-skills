import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Hail signing secrets look like whsec_..., but the whole string is the HMAC key (not Standard Webhooks)
const SECRET = 'whsec_test_hail_secret_8f3a1c';

let POST: (request: NextRequest) => Promise<Response>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  process.env.HAIL_WEBHOOK_SECRET = SECRET;
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  ({ POST } = await import('../app/webhooks/hail/route'));
});

afterEach(() => {
  delete process.env.HAIL_TIMESTAMP_TOLERANCE_SECONDS;
  process.env.HAIL_WEBHOOK_SECRET = SECRET;
  logSpy.mockClear();
});

function v1For(body: string, timestamp: number | string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

function sign(body: string, timestamp = Math.floor(Date.now() / 1000), secret = SECRET): string {
  return `t=${timestamp},v1=${v1For(body, timestamp, secret)}`;
}

// Content-Type is deliberately varied: verification must not depend on it
function post(body: string, signature?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature !== undefined) headers['x-hail-signature'] = signature;
  return POST(new NextRequest('http://localhost:3000/webhooks/hail', { method: 'POST', headers, body }));
}

const emailReceived = JSON.stringify({
  id: '9f2c1',
  type: 'email.received',
  api_version: '2026-06-06',
  created_at: '2026-06-14T12:00:00+00:00',
  organization_id: 'org-uuid',
  data: { id: 'em-uuid', direction: 'inbound', from_address: 'sender@example.com', subject: 'Re: invoice' },
});

describe("Hail docs' worked example", () => {
  it('verifies the documented body, secret and header (timestamp window off)', async () => {
    process.env.HAIL_WEBHOOK_SECRET = 'whsec_example';
    const body = '{"id":"evt_123","type":"email.received","data":{"id":"em_1"}}';
    const header = 't=1700000000,v1=72f7940d13ca8528cf655a04e82dabfe90a531e239241fda9bdff72980d33a4a';
    expect((await post(body, header)).status).toBe(200);
  });
});

describe('Hail webhook signature verification', () => {
  it('accepts a valid X-Hail-Signature', async () => {
    const res = await post(emailReceived, sign(emailReceived));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies regardless of Content-Type', async () => {
    expect((await post(emailReceived, sign(emailReceived), 'text/plain')).status).toBe(200);
  });

  it('allows a space after the comma in the header', async () => {
    const t = Math.floor(Date.now() / 1000);
    expect((await post(emailReceived, `t=${t}, v1=${v1For(emailReceived, t)}`)).status).toBe(200);
  });

  it('accepts when any of several v1 values matches (defensive parsing)', async () => {
    const t = Math.floor(Date.now() / 1000);
    const stale = v1For(emailReceived, t, 'whsec_old_secret');
    expect((await post(emailReceived, `t=${t},v1=${stale},v1=${v1For(emailReceived, t)}`)).status).toBe(200);
  });

  it('accepts an uppercase hex v1', async () => {
    const t = Math.floor(Date.now() / 1000);
    expect((await post(emailReceived, `t=${t},v1=${v1For(emailReceived, t).toUpperCase()}`)).status).toBe(200);
  });

  it('rejects a missing signature header', async () => {
    expect((await post(emailReceived, undefined)).status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    expect((await post(emailReceived.replace('invoice', 'refund'), sign(emailReceived))).status).toBe(400);
  });

  it('rejects a signature made with the wrong secret', async () => {
    expect((await post(emailReceived, sign(emailReceived, undefined, 'other_secret'))).status).toBe(400);
  });

  it('rejects when the whsec_ prefix is stripped or the secret base64-decoded', async () => {
    const t = Math.floor(Date.now() / 1000);
    const stripped = SECRET.slice('whsec_'.length);
    expect((await post(emailReceived, sign(emailReceived, t, stripped))).status).toBe(400);
    const decoded = Buffer.from(stripped, 'base64');
    const v1 = crypto.createHmac('sha256', decoded).update(`${t}.${emailReceived}`).digest('hex');
    expect((await post(emailReceived, `t=${t},v1=${v1}`)).status).toBe(400);
  });

  it('rejects wrong-length and non-hex v1 values without throwing', async () => {
    expect((await post(emailReceived, 't=1700000000,v1=abc')).status).toBe(400);
    expect((await post(emailReceived, `t=1700000000,v1=${'z'.repeat(64)}`)).status).toBe(400);
    expect((await post(emailReceived, `t=1700000000,v1=${'a'.repeat(63)}é`)).status).toBe(400);
  });

  it('rejects a header with no t or no v1', async () => {
    const t = Math.floor(Date.now() / 1000);
    expect((await post(emailReceived, `v1=${v1For(emailReceived, t)}`)).status).toBe(400);
    expect((await post(emailReceived, `t=${t}`)).status).toBe(400);
    expect((await post(emailReceived, 'garbage')).status).toBe(400);
  });

  it('rejects when the timestamp was altered after signing', async () => {
    const header = sign(emailReceived, 1700000000).replace('t=1700000000', 't=1700000001');
    expect((await post(emailReceived, header)).status).toBe(400);
  });

  it('accepts an old timestamp by default (Hookdeck retries and replays keep the original)', async () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect((await post(emailReceived, sign(emailReceived, old))).status).toBe(200);
  });

  it('rejects an old timestamp when HAIL_TIMESTAMP_TOLERANCE_SECONDS is set', async () => {
    process.env.HAIL_TIMESTAMP_TOLERANCE_SECONDS = '300';
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect((await post(emailReceived, sign(emailReceived, old))).status).toBe(400);
    expect((await post(emailReceived, sign(emailReceived))).status).toBe(200);
  });

  it('treats a non-numeric HAIL_TIMESTAMP_TOLERANCE_SECONDS as 0 (check off)', async () => {
    process.env.HAIL_TIMESTAMP_TOLERANCE_SECONDS = 'five minutes';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect((await post(emailReceived, sign(emailReceived, old))).status).toBe(200);
    warn.mockRestore();
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.HAIL_WEBHOOK_SECRET;
    expect((await post(emailReceived, sign(emailReceived))).status).toBe(500);
  });
});

describe('Hail events (dispatch on body type)', () => {
  it.each([
    'email.received',
    'email.received.suppressed',
    'email.delivered',
    'email.delivery_delayed',
    'email.bounced',
    'email.complained',
    'email.opened',
    'email.clicked',
    'email.send_failed',
    'sms.received',
    'sms.delivered',
    'sms.undelivered',
    'sms.failed',
    'call.received',
    'call.answered',
    'call.completed',
    'call.failed',
    'call.busy',
    'call.no_answer',
    'call.transferred',
  ])('handles %s', async (type) => {
    const body = JSON.stringify({ id: 'e1', type, data: { id: 'x1', direction: 'inbound', from: '+1', to: '+2' } });
    expect((await post(body, sign(body))).status).toBe(200);
    expect(logSpy.mock.calls.map((c) => c[0]).join('\n')).not.toContain('Unhandled');
  });

  it('logs unknown events as unhandled but still acknowledges', async () => {
    const body = JSON.stringify({ id: 'e1', type: 'domain.verified', data: {} });
    expect((await post(body, sign(body))).status).toBe(200);
    expect(logSpy.mock.calls.map((c) => c[0]).join('\n')).toContain('Unhandled event: domain.verified');
  });

  it('rejects verified but invalid JSON', async () => {
    const body = '{not json';
    expect((await post(body, sign(body))).status).toBe(400);
  });
});
