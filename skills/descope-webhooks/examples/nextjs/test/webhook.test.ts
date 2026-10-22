import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const SECRET = 'test_descope_hmac_secret';

// Descope: base64 HMAC-SHA256 of the JSON string it sends
function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('base64');
}

const events = [
  { action: 'LoginSucceed', actorId: 'U1', userId: 'U1', projectId: 'P1', loginIds: ['a@b.com'], occurred: 1780949905843, data: {} },
  { action: 'UserModified', actorId: 'U1', userId: 'U2', projectId: 'P1', loginIds: ['c@d.com'], occurred: 1780949905900, data: {} },
  { action: 'Change Password', actorId: 'U1', userId: 'U1', projectId: 'P1', occurred: 1780949905999, data: {} },
];
const body = JSON.stringify(events);

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.DESCOPE_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/descope/route'));
});

function makeRequest(payload: string, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/webhooks/descope', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: payload,
  });
}

describe('Descope webhook', () => {
  it('accepts a valid signature on a batch', async () => {
    const res = await POST(makeRequest(body, { 'x-descope-webhook-s256': sign(body) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, count: 3 });
  });

  it('verifies regardless of content type', async () => {
    const res = await POST(makeRequest(body, { 'content-type': 'text/plain', 'x-descope-webhook-s256': sign(body) }));
    expect(res.status).toBe(200);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const res = await POST(makeRequest(body, { 'x-descope-webhook-s256': sign(body, 'other') }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const res = await POST(
      makeRequest(body.replace('LoginSucceed', 'LoginFailed'), { 'x-descope-webhook-s256': sign(body) })
    );
    expect(res.status).toBe(400);
  });

  it('rejects a missing signature header', async () => {
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
  });

  it('rejects a malformed signature', async () => {
    const res = await POST(makeRequest(body, { 'x-descope-webhook-s256': 'not-a-signature' }));
    expect(res.status).toBe(400);
  });

  it('rejects invalid JSON even when correctly signed', async () => {
    const bad = '{not json';
    const res = await POST(makeRequest(bad, { 'x-descope-webhook-s256': sign(bad) }));
    expect(res.status).toBe(400);
  });
});
