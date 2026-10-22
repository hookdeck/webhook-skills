import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/truework/route';
import { verifyTrueworkToken, safeEqual } from '../lib/truework';

// Truework tokens are opaque strings copied from Developer Settings.
const TOKEN = 'tw_test_token_0123456789abcdef';

const orderCompleted = {
  version: '2023-10-30',
  hook: { id: 1, event: 'order.completed', target: 'https://example.com/webhooks/truework' },
  data: { order_id: 'ord_123' },
};
const stateChange = {
  version: '2023-10-30',
  hook: { id: 2, event: 'verification_request.state.change', target: 'https://example.com/webhooks/truework' },
  data: { order_id: 'ord_123', verification_request_id: 'vr_456', state: 'action-required', metadata: {} },
};

function makeRequest(body: unknown, headers: Record<string, string> = {}, contentType = 'application/json') {
  return new NextRequest('http://localhost:3000/webhooks/truework', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('Truework webhook', () => {
  beforeEach(() => {
    process.env.TRUEWORK_WEBHOOK_TOKEN = TOKEN;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('accepts order.completed with the right token', async () => {
    const res = await POST(makeRequest(orderCompleted, { 'x-truework-token': TOKEN }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, event: 'order.completed' });
  });

  it('accepts verification_request.state.change with the right token', async () => {
    const res = await POST(makeRequest(stateChange, { 'x-truework-token': TOKEN }));
    expect(res.status).toBe(200);
    expect((await res.json()).event).toBe('verification_request.state.change');
  });

  it('verifies regardless of content type', async () => {
    const res = await POST(makeRequest(orderCompleted, { 'x-truework-token': TOKEN }, 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('accepts unknown events with a valid token', async () => {
    const res = await POST(makeRequest({ hook: { event: 'something.else' }, data: {} }, { 'x-truework-token': TOKEN }));
    expect(res.status).toBe(200);
  });

  it('rejects a missing token', async () => {
    expect((await POST(makeRequest(orderCompleted))).status).toBe(401);
  });

  it('rejects a wrong token', async () => {
    expect((await POST(makeRequest(orderCompleted, { 'x-truework-token': 'nope' }))).status).toBe(401);
  });

  it('rejects a token of a different length without throwing', async () => {
    expect((await POST(makeRequest(orderCompleted, { 'x-truework-token': TOKEN + 'x' }))).status).toBe(401);
  });

  it('returns 400 for invalid JSON with a valid token', async () => {
    const res = await POST(makeRequest('{not json', { 'x-truework-token': TOKEN }));
    expect(res.status).toBe(400);
  });

  it('fails closed with 500 when no token is configured', async () => {
    delete process.env.TRUEWORK_WEBHOOK_TOKEN;
    const res = await POST(makeRequest(orderCompleted, { 'x-truework-token': '' }));
    expect(res.status).toBe(500);
  });

  it('does not let an empty header match an unset token', () => {
    expect(verifyTrueworkToken('', '')).toBeNull();
    expect(verifyTrueworkToken(undefined, TOKEN)).toBe(false);
  });

  it('safeEqual compares strings only', () => {
    expect(safeEqual('a', 'a')).toBe(true);
    expect(safeEqual('a', 'b')).toBe(false);
    expect(safeEqual(null, 'a')).toBe(false);
  });
});
