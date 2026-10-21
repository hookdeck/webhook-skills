import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/asaas/route';

// Asaas authTokens are 32-255 characters with no whitespace.
const TOKEN = 'test_asaas_auth_token_0123456789abcdef';

function payload(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: `evt_${Math.random().toString(36).slice(2)}`,
    event: 'PAYMENT_RECEIVED',
    dateCreated: '2024-06-12 16:45:03',
    payment: { object: 'payment', id: 'pay_080225913252', value: 100, status: 'RECEIVED' },
    ...overrides,
  });
}

function makeRequest(body: string, token: string | null = TOKEN) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token !== null) headers['asaas-access-token'] = token;
  return new NextRequest('http://localhost:3000/webhooks/asaas', {
    method: 'POST',
    headers,
    body,
  });
}

describe('Asaas webhook', () => {
  beforeEach(() => {
    process.env.ASAAS_WEBHOOK_TOKEN = TOKEN;
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('accepts a valid token', async () => {
    const res = await POST(makeRequest(payload()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it.each([
    'PAYMENT_CREATED',
    'PAYMENT_CONFIRMED',
    'PAYMENT_RECEIVED',
    'PAYMENT_OVERDUE',
    'PAYMENT_REFUNDED',
  ])('handles %s', async (event) => {
    const res = await POST(makeRequest(payload({ event })));
    expect(res.status).toBe(200);
  });

  it('handles subscription and transfer events', async () => {
    const sub = await POST(makeRequest(payload({ event: 'SUBSCRIPTION_CREATED', subscription: { id: 'sub_1' } })));
    const tra = await POST(makeRequest(payload({ event: 'TRANSFER_DONE', transfer: { id: 'tra_1' } })));
    expect(sub.status).toBe(200);
    expect(tra.status).toBe(200);
  });

  it('accepts unknown events with 200', async () => {
    const res = await POST(makeRequest(payload({ event: 'SOMETHING_NEW' })));
    expect(res.status).toBe(200);
  });

  it('rejects a wrong token', async () => {
    const res = await POST(makeRequest(payload(), 'wrong_token_wrong_token_wrong_token_00'));
    expect(res.status).toBe(401);
  });

  it('rejects a token of a different length', async () => {
    const res = await POST(makeRequest(payload(), 'short'));
    expect(res.status).toBe(401);
  });

  it('rejects a missing token', async () => {
    const res = await POST(makeRequest(payload(), null));
    expect(res.status).toBe(401);
  });

  it('rejects invalid JSON after a valid token', async () => {
    const res = await POST(makeRequest('{not json'));
    expect(res.status).toBe(400);
  });

  it('rejects a body without an event', async () => {
    const res = await POST(makeRequest(JSON.stringify({ id: 'evt_x' })));
    expect(res.status).toBe(400);
  });

  it('flags duplicate event ids', async () => {
    const body = payload({ id: 'evt_duplicate_1' });
    const first = await POST(makeRequest(body));
    const second = await POST(makeRequest(body));
    expect(await first.json()).toEqual({ received: true });
    expect(await second.json()).toEqual({ received: true, duplicate: true });
  });

  it('returns 500 when the token is not configured', async () => {
    delete process.env.ASAAS_WEBHOOK_TOKEN;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(makeRequest(payload()));
    expect(res.status).toBe(500);
  });
});
