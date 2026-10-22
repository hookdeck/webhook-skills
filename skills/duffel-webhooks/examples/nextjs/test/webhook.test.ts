import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Duffel secrets look base64 but are used as raw strings; this one is only for tests
const SECRET = '54vFWvaSbbzYpxXPeB4YEw==';

let POST: (request: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.DUFFEL_WEBHOOK_SECRET = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  ({ POST } = await import('../app/webhooks/duffel/route'));
});

function sign(body: string, timestamp = Math.floor(Date.now() / 1000), secret = SECRET): string {
  const v1 = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

function post(body: string, signature?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature) headers['x-duffel-signature'] = signature;
  return POST(
    new NextRequest('http://localhost:3000/webhooks/duffel', { method: 'POST', headers, body })
  );
}

const event = (type: string) =>
  JSON.stringify({
    id: 'wev_0000A6VP9fgKxAccTSKWUy',
    type,
    live_mode: false,
    idempotency_key: 'aic_0000ApoiwggSbt7BordU1o',
    created_at: '2021-04-22T13:13:18.420272Z',
    data: { object: { id: 'ord_0000A1' } },
  });

describe('Duffel webhook', () => {
  it.each([
    'ping.triggered',
    'order.created',
    'order.airline_initiated_change_detected',
    'order_cancellation.confirmed',
    'payment.succeeded',
    'order.unknown',
  ])('accepts a valid signature for %s', async (type) => {
    const body = event(type);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('uses the secret as-is, not base64-decoded', async () => {
    const body = event('order.created');
    const v1 = crypto
      .createHmac('sha256', Buffer.from(SECRET, 'base64'))
      .update(`1616202842.${body}`)
      .digest('hex');
    const res = await post(body, `t=1616202842,v1=${v1}`);
    expect(res.status).toBe(400);
  });

  it('verifies any content type', async () => {
    const body = event('order.created');
    const res = await post(body, sign(body), 'text/plain');
    expect(res.status).toBe(200);
  });

  it('rejects a tampered body', async () => {
    const body = event('order.created');
    const res = await post(body.replace('ord_0000A1', 'ord_evil'), sign(body));
    expect(res.status).toBe(400);
  });

  it('rejects a wrong secret', async () => {
    const body = event('order.created');
    const res = await post(body, sign(body, undefined, 'other_secret'));
    expect(res.status).toBe(400);
  });

  it('rejects a missing signature header', async () => {
    const res = await post(event('order.created'));
    expect(res.status).toBe(400);
  });

  it('rejects a malformed signature header', async () => {
    const res = await post(event('order.created'), 'garbage');
    expect(res.status).toBe(400);
  });

  it('rejects a signature of different length without throwing', async () => {
    const res = await post(event('order.created'), 't=1616202842,v1=abcd');
    expect(res.status).toBe(400);
  });

  it('rejects invalid JSON with a valid signature', async () => {
    const body = 'not json';
    const res = await post(body, sign(body));
    expect(res.status).toBe(400);
  });

  it('accepts an old timestamp by default', async () => {
    const body = event('order.created');
    const res = await post(body, sign(body, Math.floor(Date.now() / 1000) - 86400));
    expect(res.status).toBe(200);
  });

  describe('with DUFFEL_TIMESTAMP_TOLERANCE_SECONDS=300', () => {
    beforeAll(() => { process.env.DUFFEL_TIMESTAMP_TOLERANCE_SECONDS = '300'; });
    afterAll(() => { delete process.env.DUFFEL_TIMESTAMP_TOLERANCE_SECONDS; });

    it('rejects an old timestamp', async () => {
      const body = event('order.created');
      const res = await post(body, sign(body, Math.floor(Date.now() / 1000) - 3600));
      expect(res.status).toBe(400);
    });

    it('accepts a fresh timestamp', async () => {
      const body = event('order.created');
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
    });
  });
});
