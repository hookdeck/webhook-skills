import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const SECRET = 'test_castle_api_secret';

beforeAll(() => {
  process.env.CASTLE_API_SECRET = SECRET;
});

// Castle: base64(HMAC-SHA256(raw body, API secret))
function sign(payload: string, secret: string = SECRET): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64');
}

async function post(payload: string, signature?: string) {
  const { POST } = await import('../app/webhooks/castle/route');
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature) headers['x-castle-signature'] = signature;
  return POST(
    new NextRequest('http://localhost:3000/webhooks/castle', { method: 'POST', headers, body: payload })
  );
}

describe('verifyCastleSignature', () => {
  it('accepts a valid signature', async () => {
    const { verifyCastleSignature } = await import('../lib/castle');
    const body = '{"type":"$policy.matched"}';
    expect(verifyCastleSignature(body, sign(body), SECRET)).toBe(true);
  });

  it('rejects invalid, missing, and wrong-secret signatures', async () => {
    const { verifyCastleSignature } = await import('../lib/castle');
    const body = '{}';
    expect(verifyCastleSignature(body, 'nope', SECRET)).toBe(false);
    expect(verifyCastleSignature(body, null, SECRET)).toBe(false);
    expect(verifyCastleSignature(body, sign(body, 'other'), SECRET)).toBe(false);
  });
});

describe('POST /webhooks/castle', () => {
  it('returns 400 for missing signature', async () => {
    const res = await post('{"type":"$policy.matched"}');
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid signature', async () => {
    const res = await post('{"type":"$policy.matched"}', 'invalid');
    expect(res.status).toBe(400);
  });

  it('returns 400 when body is modified after signing', async () => {
    const res = await post('{"type":"$list_item.created"}', sign('{"type":"$policy.matched"}'));
    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid $policy.matched event', async () => {
    const payload = JSON.stringify({
      api_version: 'v1',
      type: '$policy.matched',
      data: { policy: { id: 'p1', name: 'Trust @legit.io', action: 'allow' } },
    });
    const res = await post(payload, sign(payload));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('handles all documented event types', async () => {
    for (const type of ['$policy.matched', '$list_item.created', '$list_item.archived', '$list_item.unarchived']) {
      const payload = JSON.stringify({ api_version: 'v1', type, data: { id: 'x', primary_value: 'abc' } });
      const res = await post(payload, sign(payload));
      expect(res.status).toBe(200);
    }
  });

  it('returns 200 for unknown event types with a valid signature', async () => {
    const payload = JSON.stringify({ type: '$unknown.event', data: {} });
    const res = await post(payload, sign(payload));
    expect(res.status).toBe(200);
  });
});
