import crypto from 'crypto';
import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/hibob/route';

const SECRET = 'test_bob_webhook_secret'; // Bob secrets are used as raw strings

// Same algorithm as Bob: base64(HMAC-SHA512(body, secret))
function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha512', secret).update(body).digest('base64');
}

function makeRequest(body: string, signature?: string): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature) headers['bob-signature'] = signature;
  return new NextRequest('http://localhost:3000/webhooks/hibob', {
    method: 'POST',
    headers,
    body,
  });
}

const event = (type: string) =>
  JSON.stringify({
    companyId: 1,
    version: 'v2',
    type,
    triggeredBy: 'system',
    triggeredAt: '2026-01-01T00:00:00Z',
    data: { employeeId: '3332' },
  });

describe('Bob webhook route', () => {
  beforeEach(() => {
    process.env.HIBOB_WEBHOOK_SECRET = SECRET;
  });

  it.each([
    'employee.created',
    'employee.updated',
    'employee.joined',
    'employee.left',
    'timeoff.request.requested',
    'timeoff.request.approved',
    'employee.deleted',
  ])('accepts a signed %s event', async (type) => {
    const body = event(type);
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('rejects an invalid signature', async () => {
    const res = await POST(makeRequest(event('employee.created'), 'invalid'));
    expect(res.status).toBe(400);
  });

  it('rejects a missing signature', async () => {
    const res = await POST(makeRequest(event('employee.created')));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with a different secret', async () => {
    const body = event('employee.created');
    const res = await POST(makeRequest(body, sign(body, 'other_secret')));
    expect(res.status).toBe(400);
  });

  it('rejects a validly signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(400);
  });

  it('answers the JSON ping test with 200', async () => {
    const res = await POST(makeRequest(JSON.stringify({ text: 'Ping test' })));
    expect(res.status).toBe(200);
  });

  it('answers the plain text ping test with 200', async () => {
    const res = await POST(makeRequest('Ping test'));
    expect(res.status).toBe(200);
  });
});
