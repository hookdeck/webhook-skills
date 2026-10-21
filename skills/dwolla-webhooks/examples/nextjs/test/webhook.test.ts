import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const SECRET = 'test_dwolla_subscription_secret';

// Dwolla: hex HMAC-SHA256 of the raw body, keyed with the subscription secret
function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    resourceId: '36E9DCB2-889B-4873-8E52-0C9404EA002A',
    topic: 'customer_created',
    timestamp: '2015-10-22T14:44:11.407Z',
    _links: { self: { href: 'https://api-sandbox.dwolla.com/events/x' } },
    ...overrides,
  };
}

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.DWOLLA_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/dwolla/route'));
});

function call(body: string, signature?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/vnd.dwolla.v1.hal+json' };
  if (signature !== undefined) headers['x-request-signature-sha-256'] = signature;
  return POST(
    new NextRequest('http://localhost:3000/webhooks/dwolla', { method: 'POST', headers, body })
  );
}

describe('Dwolla webhook', () => {
  it('accepts a valid signature', async () => {
    const body = JSON.stringify(makeEvent());
    const res = await call(body, sign(body));
    expect(res.status).toBe(200);
    expect((await res.json()).received).toBe(true);
  });

  it.each([
    'customer_verified',
    'customer_funding_source_added',
    'customer_funding_source_verified',
    'customer_transfer_created',
    'customer_transfer_completed',
    'customer_transfer_failed',
    'customer_bank_transfer_completed',
    'some_unknown_topic',
  ])('handles %s', async (topic) => {
    const body = JSON.stringify(makeEvent({ topic }));
    expect((await call(body, sign(body))).status).toBe(200);
  });

  it('rejects an invalid signature', async () => {
    const body = JSON.stringify(makeEvent());
    expect((await call(body, 'a'.repeat(64))).status).toBe(400);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = JSON.stringify(makeEvent());
    expect((await call(body, sign(body, 'wrong_secret'))).status).toBe(400);
  });

  it('rejects a missing signature', async () => {
    expect((await call(JSON.stringify(makeEvent()))).status).toBe(400);
  });

  it('rejects a signature of a different length', async () => {
    expect((await call(JSON.stringify(makeEvent()), 'short')).status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(makeEvent());
    const res = await call(body.replace('customer_created', 'customer_verified'), sign(body));
    expect(res.status).toBe(400);
  });

  it('verifies against the raw body, not re-encoded JSON', async () => {
    const body = '{ "id":"evt-raw-1",  "topic":"customer_created", "resourceId":"r1" }';
    expect((await call(body, sign(body))).status).toBe(200);
  });

  it('returns 200 for a duplicate event ID', async () => {
    const body = JSON.stringify(makeEvent());
    const sig = sign(body);
    await call(body, sig);
    const res = await call(body, sig);
    expect(res.status).toBe(200);
    expect((await res.json()).duplicate).toBe(true);
  });

  it('rejects a validly signed body that is not JSON', async () => {
    const body = 'not json';
    expect((await call(body, sign(body))).status).toBe(400);
  });
});
