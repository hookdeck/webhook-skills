import { describe, it, expect, beforeAll, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Middesk secrets are arbitrary strings (e.g. whsec_... or sec_...) used whole as the key.
const secret = 'whsec_abcdef123456';

let POST: (request: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.MIDDESK_WEBHOOK_SECRET = secret;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  ({ POST } = await import('../app/webhooks/middesk/route'));
});

// Real Middesk algorithm: bare hex HMAC-SHA256 of the raw body, secret as UTF-8 string.
function sign(payload: string, key = secret): string {
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

function eventPayload(type: string): string {
  return JSON.stringify({
    object: 'event',
    id: 'f215a707-655e-400f-84e6-fbb949f5612a',
    type,
    data: {
      object: {
        id: '0f86dab5-8195-4b95-b3c0-19deaeba2a8e',
        object: 'business',
        name: 'A Company',
        status: 'open',
      },
    },
    created_at: '2020-01-02T23:54:48.239Z',
  });
}

function makeRequest(body: string, signature?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature) headers['x-middesk-signature-256'] = signature;
  return new NextRequest('http://localhost:3000/webhooks/middesk', {
    method: 'POST',
    headers,
    body,
  });
}

describe('Middesk webhook route', () => {
  it.each([
    'business.created',
    'business.updated',
    'order.created',
    'order.updated',
    'monitor.created',
    'monitor.updated',
    'tin.retried',
    'lien.updated',
  ])('handles %s', async (type) => {
    const payload = eventPayload(type);
    const res = await POST(makeRequest(payload, sign(payload)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('returns 200 for unhandled event types', async () => {
    const payload = eventPayload('person.created');
    const res = await POST(makeRequest(payload, sign(payload)));
    expect(res.status).toBe(200);
  });

  it('verifies regardless of content type', async () => {
    const payload = eventPayload('business.created');
    const res = await POST(makeRequest(payload, sign(payload), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await POST(makeRequest(eventPayload('business.created'), 'a'.repeat(64)));
    expect(res.status).toBe(400);
  });

  it('returns 400 when the signature header is missing', async () => {
    const res = await POST(makeRequest(eventPayload('business.created')));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a wrong secret', async () => {
    const payload = eventPayload('business.created');
    const res = await POST(makeRequest(payload, sign(payload, 'sec_wrong')));
    expect(res.status).toBe(400);
  });

  it('does not strip a whsec_ prefix or base64-decode the secret', async () => {
    const payload = eventPayload('business.created');
    const stripped = await POST(makeRequest(payload, sign(payload, 'abcdef123456')));
    expect(stripped.status).toBe(400);
    const decoded = crypto
      .createHmac('sha256', Buffer.from('abcdef123456', 'base64'))
      .update(payload)
      .digest('hex');
    expect((await POST(makeRequest(payload, decoded))).status).toBe(400);
  });

  it('returns 400 when the body was modified after signing', async () => {
    const signature = sign(eventPayload('business.created'));
    const res = await POST(makeRequest(eventPayload('business.updated'), signature));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const payload = 'not json';
    const res = await POST(makeRequest(payload, sign(payload), 'text/plain'));
    expect(res.status).toBe(400);
  });
});
