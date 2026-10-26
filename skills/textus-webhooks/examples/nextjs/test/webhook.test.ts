import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Set before importing the route. TextUs secrets look like `textus-<random>`.
const SECRET = 'textus-HOTh4kXxHIbYst0xutpkdw';
process.env.TEXTUS_WEBHOOK_SECRET = SECRET;

const { POST } = await import('../app/webhooks/textus/route');

// Bare hex HMAC-SHA256 of the raw body, keyed with the whole secret string.
function sign(payload: string, secret: string = SECRET): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function makeRequest(body: string, signature?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'Content-Type': contentType };
  if (signature !== undefined) headers['X-TextUs-Signature'] = signature;
  return new NextRequest('http://localhost:3000/webhooks/textus', {
    method: 'POST',
    headers,
    body,
  });
}

describe('TextUs webhook route', () => {
  const payload = JSON.stringify({
    action: 'message.received',
    timestamp: '2026-10-20T18:38:00Z',
    message: { id: 'msg_1' },
  });

  it('returns 401 for a missing signature', async () => {
    const res = await POST(makeRequest(payload));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a signature that is not 64 hex chars', async () => {
    const res = await POST(makeRequest(payload, 'deadbeef'));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a 64-char non-hex signature', async () => {
    const res = await POST(makeRequest(payload, 'z'.repeat(64)));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a wrong secret', async () => {
    const res = await POST(makeRequest(payload, sign(payload, 'textus-other-secret')));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the secret prefix is stripped from the key', async () => {
    const res = await POST(makeRequest(payload, sign(payload, 'HOTh4kXxHIbYst0xutpkdw')));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a tampered payload', async () => {
    const res = await POST(makeRequest(payload.replace('msg_1', 'msg_2'), sign(payload)));
    expect(res.status).toBe(401);
  });

  it('returns 200 for a valid signature', async () => {
    const res = await POST(makeRequest(payload, sign(payload)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts an uppercase hex signature', async () => {
    const res = await POST(makeRequest(payload, sign(payload).toUpperCase()));
    expect(res.status).toBe(200);
  });

  it('verifies regardless of content type', async () => {
    const res = await POST(makeRequest(payload, sign(payload), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const res = await POST(makeRequest('not json', sign('not json')));
    expect(res.status).toBe(400);
  });

  it.each([
    'message.received',
    'message.delivered',
    'message.failed',
    'message.unknown',
    'phone_call.completed',
    'contact.opted_out',
    'contact.opted_in',
    'contact.created',
    'something.else',
  ])('handles %s', async (action) => {
    const body = JSON.stringify({ action, timestamp: '2026-10-20T18:38:00Z' });
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
  });
});
