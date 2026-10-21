import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Bolt Signing Secret is an arbitrary raw string (used as-is, not decoded)
const SECRET = 'test_bolt_signing_secret';

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.BOLT_SIGNING_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/bolt/route'));
});

// Bolt: base64(HMAC-SHA256(rawBody, signingSecret)) in X-Bolt-Hmac-Sha256
function sign(payload: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64');
}

function makeRequest(payload: string, signature?: string): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature) headers['x-bolt-hmac-sha256'] = signature;
  return new NextRequest('http://localhost:3000/webhooks/bolt', {
    method: 'POST',
    headers,
    body: payload,
  });
}

describe('POST /webhooks/bolt', () => {
  it('returns 400 when the signature header is missing', async () => {
    const res = await POST(makeRequest('{"type":"payment"}'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await POST(makeRequest('{"type":"payment"}', 'invalid'));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe('Invalid signature');
  });

  it('returns 400 for a signature made with the wrong secret', async () => {
    const payload = '{"type":"payment"}';
    const res = await POST(makeRequest(payload, sign(payload, 'other_secret')));
    expect(res.status).toBe(400);
  });

  it('returns 400 when the body was tampered with', async () => {
    const res = await POST(makeRequest('{"type":"void"}', sign('{"type":"payment"}')));
    expect(res.status).toBe(400);
  });

  it.each([
    'pending', 'payment', 'auth', 'capture', 'credit', 'void',
    'failed_payment', 'rejected_irreversible', 'rejected_reversible',
    'risk_insights', 'newsletter_subscription',
  ])('accepts a signed %s transaction event with a JSON 200', async (type) => {
    const payload = JSON.stringify({
      type,
      object: 'transaction',
      data: { id: 'T1c3p4yBuVYJ9', reference: 'LBLJ-TWW7-R9VC', status: 'completed' },
    });
    const res = await POST(makeRequest(payload, sign(payload)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts a signed credit_card_deleted event', async () => {
    const payload = JSON.stringify({
      type: 'credit_card_deleted',
      object: 'credit_card',
      data: { user: { id: 'b2vghjk2v4c5fgdh3jak' }, credit_card: {} },
    });
    const res = await POST(makeRequest(payload, sign(payload)));
    expect(res.status).toBe(200);
  });

  it('acknowledges unknown event types', async () => {
    const payload = JSON.stringify({ type: 'subscription_created', object: 'subscription', data: {} });
    const res = await POST(makeRequest(payload, sign(payload)));
    expect(res.status).toBe(200);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const payload = 'not json';
    const res = await POST(makeRequest(payload, sign(payload)));
    expect(res.status).toBe(400);
  });
});
