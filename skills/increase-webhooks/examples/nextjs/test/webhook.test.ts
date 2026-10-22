import { describe, it, expect, beforeAll, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Increase shared secrets are arbitrary 1-100 character strings used as raw UTF-8 bytes
const SECRET = 'test_shared_secret_n8Kd2pQx';

let POST: (request: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.INCREASE_WEBHOOK_SECRET = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  ({ POST } = await import('../app/webhooks/increase/route'));
});

function sign(id: string, timestamp: number, body: string, secret: string | Buffer = SECRET): string {
  const digest = crypto.createHmac('sha256', secret).update(`${id}.${timestamp}.${body}`).digest('base64');
  return `v1,${digest}`;
}

function headersFor(
  body: string,
  { id = 'event_123abc', timestamp = Math.floor(Date.now() / 1000), secret = SECRET as string | Buffer } = {}
): Record<string, string> {
  return {
    'webhook-id': id,
    'webhook-timestamp': String(timestamp),
    'webhook-signature': sign(id, timestamp, body, secret),
  };
}

function post(body: string, headers: Record<string, string>, contentType = 'application/json') {
  return POST(
    new NextRequest('http://localhost:3000/webhooks/increase', {
      method: 'POST',
      headers: { 'content-type': contentType, ...headers },
      body,
    })
  );
}

const created = JSON.stringify({
  id: 'event_123abc',
  created_at: '2020-01-31T23:59:59Z',
  category: 'transaction.created',
  associated_object_type: 'transaction',
  associated_object_id: 'transaction_abc123',
  type: 'event',
});

describe('Increase webhook', () => {
  it('accepts a valid signature', async () => {
    const res = await post(created, headersFor(created));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies any content type because the body is read raw', async () => {
    const res = await post(created, headersFor(created), 'text/plain');
    expect(res.status).toBe(200);
  });

  it('uses the secret as raw bytes, not base64 or whsec_-decoded', async () => {
    const b64Looking = 'dGVzdF9zZWNyZXRfa2V5';
    process.env.INCREASE_WEBHOOK_SECRET = b64Looking;
    try {
      const ok = await post(created, headersFor(created, { secret: b64Looking }));
      expect(ok.status).toBe(200);
      const decoded = await post(created, headersFor(created, { secret: Buffer.from(b64Looking, 'base64') }));
      expect(decoded.status).toBe(400);
    } finally {
      process.env.INCREASE_WEBHOOK_SECRET = SECRET;
    }
  });

  it('accepts when any of several space-separated signatures matches', async () => {
    const h = headersFor(created);
    h['webhook-signature'] = `v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= ${h['webhook-signature']}`;
    const res = await post(created, h);
    expect(res.status).toBe(200);
  });

  it('rejects a tampered body', async () => {
    const res = await post(created.replace('transaction.created', 'account.created'), headersFor(created));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const res = await post(created, headersFor(created, { secret: 'other_secret' }));
    expect(res.status).toBe(400);
  });

  it('rejects a signature for a different webhook-id', async () => {
    const h = headersFor(created);
    h['webhook-id'] = 'event_other';
    const res = await post(created, h);
    expect(res.status).toBe(400);
  });

  it('rejects a malformed signature of different length without throwing', async () => {
    const h = headersFor(created);
    h['webhook-signature'] = 'v1,short';
    const res = await post(created, h);
    expect(res.status).toBe(400);
  });

  it('rejects missing headers', async () => {
    const res = await post(created, {});
    expect(res.status).toBe(400);
  });

  it('rejects a non-integer timestamp', async () => {
    const h = headersFor(created);
    h['webhook-timestamp'] = 'yesterday';
    const res = await post(created, h);
    expect(res.status).toBe(400);
  });

  it('accepts an old timestamp by default (retries and replays keep the original)', async () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    const res = await post(created, headersFor(created, { timestamp: old }));
    expect(res.status).toBe(200);
  });

  it('rejects an old timestamp when INCREASE_TIMESTAMP_TOLERANCE_SECONDS is set', async () => {
    process.env.INCREASE_TIMESTAMP_TOLERANCE_SECONDS = '300';
    try {
      const old = Math.floor(Date.now() / 1000) - 3600;
      const stale = await post(created, headersFor(created, { timestamp: old }));
      expect(stale.status).toBe(400);
      const fresh = await post(created, headersFor(created));
      expect(fresh.status).toBe(200);
    } finally {
      delete process.env.INCREASE_TIMESTAMP_TOLERANCE_SECONDS;
    }
  });

  it('rejects invalid JSON that is correctly signed', async () => {
    const body = 'not json';
    const res = await post(body, headersFor(body));
    expect(res.status).toBe(400);
  });

  it('acknowledges event categories it does not handle', async () => {
    const body = JSON.stringify({ id: 'event_9', category: 'card_dispute.updated', type: 'event' });
    const res = await post(body, headersFor(body, { id: 'event_9' }));
    expect(res.status).toBe(200);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.INCREASE_WEBHOOK_SECRET;
    try {
      const res = await post(created, headersFor(created));
      expect(res.status).toBe(500);
    } finally {
      process.env.INCREASE_WEBHOOK_SECRET = SECRET;
    }
  });
});
