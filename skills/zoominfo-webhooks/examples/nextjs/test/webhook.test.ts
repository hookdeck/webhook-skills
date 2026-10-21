import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/zoominfo/route';

const TOKEN = 'zi_test_token_0123456789abcdef';
const payload = JSON.stringify({ data: [{ id: 1, email: 'a@example.com' }] });

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/webhooks/zoominfo', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('ZoomInfo webhook (Next.js)', () => {
  beforeEach(() => {
    process.env.ZOOMINFO_WEBHOOK_TOKEN = TOKEN;
  });

  afterEach(() => {
    delete process.env.ZOOMINFO_WEBHOOK_TOKEN;
  });

  it('accepts a request with the correct x-zoominfo-token', async () => {
    const res = await POST(makeRequest(payload, { 'x-zoominfo-token': TOKEN }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, verified: true });
  });

  it('rejects a wrong token', async () => {
    const res = await POST(makeRequest(payload, { 'x-zoominfo-token': 'wrong' }));
    expect(res.status).toBe(401);
  });

  it('rejects a token of a different length without throwing', async () => {
    const res = await POST(makeRequest(payload, { 'x-zoominfo-token': TOKEN + 'x' }));
    expect(res.status).toBe(401);
  });

  it('rejects a missing token header', async () => {
    const res = await POST(makeRequest(payload));
    expect(res.status).toBe(401);
  });

  it('returns 400 for a valid token with invalid JSON', async () => {
    const res = await POST(makeRequest('not json', { 'x-zoominfo-token': TOKEN }));
    expect(res.status).toBe(400);
  });

  it('acknowledges the Validate sample without processing when no token is configured', async () => {
    delete process.env.ZOOMINFO_WEBHOOK_TOKEN;
    const res = await POST(makeRequest(payload));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, verified: false });
  });
});
