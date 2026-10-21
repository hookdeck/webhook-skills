import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/lemon-squeezy/route';

// Lemon Squeezy signing secrets are arbitrary 6-40 character strings (used as-is, not decoded)
const SECRET = 'test_signing_secret';

beforeAll(() => {
  process.env.LEMON_SQUEEZY_SIGNING_SECRET = SECRET;
});

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function payload(eventName: string, type = 'orders'): string {
  return JSON.stringify({
    meta: { event_name: eventName, custom_data: { user_id: '42' } },
    data: { type, id: '1', attributes: { total_formatted: '$11.99', status: 'active', ends_at: null } },
  });
}

function send(body: string, headers: Record<string, string> = {}) {
  return POST(
    new NextRequest('http://localhost:3000/webhooks/lemon-squeezy', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body,
    })
  );
}

describe('Lemon Squeezy webhook route', () => {
  const events = [
    'order_created',
    'order_refunded',
    'subscription_created',
    'subscription_updated',
    'subscription_cancelled',
    'subscription_payment_success',
    'license_key_created',
  ];

  it.each(events)('accepts a validly signed %s event', async (eventName) => {
    const body = payload(eventName);
    const res = await send(body, { 'x-event-name': eventName, 'x-signature': sign(body) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('falls back to meta.event_name when X-Event-Name is absent', async () => {
    const body = payload('order_created');
    const res = await send(body, { 'x-signature': sign(body) });
    expect(res.status).toBe(200);
  });

  it('accepts unhandled event types', async () => {
    const body = payload('customer_updated', 'customers');
    const res = await send(body, { 'x-event-name': 'customer_updated', 'x-signature': sign(body) });
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature', async () => {
    const res = await send(payload('order_created'), { 'x-event-name': 'order_created' });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid signature', async () => {
    const res = await send(payload('order_created'), { 'x-signature': 'deadbeef' });
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = payload('order_created');
    const res = await send(body, { 'x-signature': sign(body, 'other_secret') });
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = payload('order_created');
    const res = await send(body.replace('11.99', '0.01'), { 'x-signature': sign(body) });
    expect(res.status).toBe(400);
  });

  it('rejects invalid JSON even when correctly signed', async () => {
    const body = 'not json';
    const res = await send(body, { 'x-signature': sign(body) });
    expect(res.status).toBe(400);
  });
});
