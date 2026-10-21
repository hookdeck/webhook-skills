import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const SHARED_KEY = '123'; // Maxio uses the Site Shared Key as a raw string
const HEADER = 'X-Chargify-Webhook-Signature-Hmac-Sha-256';
const vectorBody = 'payload[chargify]=testing&event=test';
const vectorSig = '19826d51b9f866b26eda1f154de192593360f8d0bcb63df8a28540a5dcf733f1';

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.MAXIO_SHARED_KEY = SHARED_KEY;
  ({ POST } = await import('../app/webhooks/maxio/route'));
});

function sign(body: string, key = SHARED_KEY) {
  return crypto.createHmac('sha256', key).update(body).digest('hex');
}

function makeRequest(body: string, signature?: string) {
  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
  };
  if (signature !== undefined) headers[HEADER] = signature;
  return new NextRequest('http://localhost:3000/webhooks/maxio', {
    method: 'POST',
    headers,
    body,
  });
}

describe('Maxio webhook route', () => {
  it('matches the documented test vector', async () => {
    expect(sign(vectorBody)).toBe(vectorSig);
    const res = await POST(makeRequest(vectorBody, vectorSig));
    expect(res.status).toBe(200);
  });

  for (const event of [
    'signup_success',
    'payment_success',
    'payment_failure',
    'renewal_success',
    'subscription_state_change',
  ]) {
    it(`accepts a signed ${event} event`, async () => {
      const body = `payload[subscription][id]=42&event=${event}`;
      const res = await POST(makeRequest(body, sign(body)));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });
  }

  it('accepts an uppercase hex signature', async () => {
    const res = await POST(makeRequest(vectorBody, vectorSig.toUpperCase()));
    expect(res.status).toBe(200);
  });

  it('rejects an invalid signature', async () => {
    const res = await POST(makeRequest(vectorBody, 'a'.repeat(64)));
    expect(res.status).toBe(400);
  });

  it('rejects a signature of the wrong length', async () => {
    const res = await POST(makeRequest(vectorBody, 'abcd'));
    expect(res.status).toBe(400);
  });

  it('rejects a missing signature header', async () => {
    const res = await POST(makeRequest(vectorBody));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const res = await POST(makeRequest('payload[chargify]=evil&event=test', vectorSig));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with the wrong key', async () => {
    const res = await POST(makeRequest(vectorBody, sign(vectorBody, 'wrong')));
    expect(res.status).toBe(400);
  });
});
