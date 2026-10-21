import { describe, it, expect, beforeAll, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Whop secrets are "ws_" + 64 hex chars and are used as the literal UTF-8 HMAC key.
const TEST_SECRET = 'ws_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.WHOP_WEBHOOK_SECRET = TEST_SECRET;
  ({ POST } = await import('../app/webhooks/whop/route'));
});

// Standard Webhooks signature as Whop produces it: HMAC-SHA256 over
// "{id}.{timestamp}.{body}" keyed with the literal secret, base64, prefixed "v1,".
function sign(
  body: string,
  { id = 'msg_test123', timestamp = Math.floor(Date.now() / 1000), secret = TEST_SECRET } = {}
) {
  const signature = crypto.createHmac('sha256', secret).update(`${id}.${timestamp}.${body}`).digest('base64');
  return {
    'content-type': 'application/json',
    'webhook-id': id,
    'webhook-timestamp': String(timestamp),
    'webhook-signature': `v1,${signature}`,
  };
}

function event(type: string) {
  return JSON.stringify({
    id: 'msg_test123',
    type,
    api_version: 'v1',
    timestamp: new Date().toISOString(),
    account_id: 'biz_XXXXXXXX',
    data: { id: 'pay_XXXXXXXX' },
  });
}

function makeRequest(body: string, headers: Record<string, string>) {
  return new NextRequest('http://localhost:3000/webhooks/whop', { method: 'POST', headers, body });
}

describe('Whop webhook route', () => {
  it.each([
    'payment.succeeded',
    'payment.failed',
    'membership.activated',
    'membership.deactivated',
    'refund.created',
  ])('accepts a valid %s event', async (type) => {
    const body = event(type);
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts an unhandled event type', async () => {
    const body = event('product.updated');
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = event('payment.succeeded');
    const res = await POST(makeRequest(body, sign(body, { secret: 'ws_wrong' })));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const headers = sign(event('payment.succeeded'));
    const res = await POST(makeRequest(event('refund.created'), headers));
    expect(res.status).toBe(400);
  });

  it('rejects a secret that had its prefix stripped', async () => {
    const body = event('payment.succeeded');
    const res = await POST(makeRequest(body, sign(body, { secret: TEST_SECRET.slice(3) })));
    expect(res.status).toBe(400);
  });

  it('rejects missing signature headers', async () => {
    const body = event('payment.succeeded');
    const res = await POST(makeRequest(body, { 'content-type': 'application/json' }));
    expect(res.status).toBe(400);
  });

  it('accepts an old timestamp by default (retries and replays keep the original)', async () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    const body = event('payment.succeeded');
    const res = await POST(makeRequest(body, sign(body, { timestamp: old })));
    expect(res.status).toBe(200);
  });

  it('rejects an old timestamp when WHOP_TIMESTAMP_TOLERANCE_SECONDS is set', async () => {
    process.env.WHOP_TIMESTAMP_TOLERANCE_SECONDS = '300';
    try {
      const old = Math.floor(Date.now() / 1000) - 3600;
      const body = event('payment.succeeded');
      const res = await POST(makeRequest(body, sign(body, { timestamp: old })));
      expect(res.status).toBe(400);
    } finally {
      delete process.env.WHOP_TIMESTAMP_TOLERANCE_SECONDS;
    }
  });

  it('treats a non-numeric WHOP_TIMESTAMP_TOLERANCE_SECONDS as 0 (check off)', async () => {
    process.env.WHOP_TIMESTAMP_TOLERANCE_SECONDS = 'five minutes';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const old = Math.floor(Date.now() / 1000) - 3600;
      const body = event('payment.succeeded');
      const res = await POST(makeRequest(body, sign(body, { timestamp: old })));
      expect(res.status).toBe(200);
    } finally {
      delete process.env.WHOP_TIMESTAMP_TOLERANCE_SECONDS;
      warn.mockRestore();
    }
  });
});
