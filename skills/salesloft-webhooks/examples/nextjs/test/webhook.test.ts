import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { verifySalesloftSignature } from '../lib/verify-salesloft';

// The callback_token is any string you choose when creating the subscription
const TOKEN = 'test_callback_token';

// Sign like Salesloft: hex(HMAC-SHA1(callback_token, rawBody))
function sign(content: string, token = TOKEN): string {
  return crypto.createHmac('sha1', token).update(content, 'utf8').digest('hex');
}

const personCreated = { id: 'evt-1', callback_token: TOKEN, data: { id: 101 } };

function makeRequest(
  body: string,
  opts: { signature?: string; event?: string; contentType?: string } = {}
) {
  const headers: Record<string, string> = {
    'content-type': opts.contentType ?? 'application/json',
  };
  if (opts.signature) headers['x-salesloft-signature'] = opts.signature;
  if (opts.event) headers['x-salesloft-event'] = opts.event;
  return new NextRequest('http://localhost:3000/webhooks/salesloft', {
    method: 'POST',
    headers,
    body,
  });
}

describe('verifySalesloftSignature', () => {
  it('accepts a valid signature over the raw body', () => {
    const body = JSON.stringify(personCreated);
    expect(verifySalesloftSignature(body, sign(body), TOKEN)).toBe(true);
  });

  it('produces a 40-char hex HMAC-SHA1 digest', () => {
    expect(sign('{}')).toMatch(/^[a-f0-9]{40}$/);
  });

  it('rejects a SHA-256 signature', () => {
    const body = JSON.stringify(personCreated);
    const sha256 = crypto.createHmac('sha256', TOKEN).update(body).digest('hex');
    expect(verifySalesloftSignature(body, sha256, TOKEN)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const body = JSON.stringify(personCreated);
    expect(verifySalesloftSignature(body + ' ', sign(body), TOKEN)).toBe(false);
  });

  it('rejects the wrong token', () => {
    const body = JSON.stringify(personCreated);
    expect(verifySalesloftSignature(body, sign(body, 'other'), TOKEN)).toBe(false);
  });

  it('rejects missing signature or token and a length mismatch', () => {
    expect(verifySalesloftSignature('{}', undefined, TOKEN)).toBe(false);
    expect(verifySalesloftSignature('{}', sign('{}'), undefined)).toBe(false);
    expect(verifySalesloftSignature('{}', 'abc', TOKEN)).toBe(false);
  });
});

describe('POST /webhooks/salesloft', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    process.env.SALESLOFT_CALLBACK_TOKEN = TOKEN;
    ({ POST } = await import('../app/webhooks/salesloft/route'));
  });

  it.each([
    'person_created',
    'person_updated',
    'call_created',
    'email_updated',
    'meeting_booked',
    'cadence_membership_created',
  ])('accepts a signed %s event', async (event) => {
    const body = JSON.stringify(personCreated);
    const res = await POST(makeRequest(body, { signature: sign(body), event }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies regardless of content type', async () => {
    const body = JSON.stringify(personCreated);
    const res = await POST(
      makeRequest(body, { signature: sign(body), event: 'person_created', contentType: 'text/plain' })
    );
    expect(res.status).toBe(200);
  });

  it('accepts an unknown event type once verified', async () => {
    const body = JSON.stringify(personCreated);
    const res = await POST(makeRequest(body, { signature: sign(body), event: 'something_new' }));
    expect(res.status).toBe(200);
  });

  it('returns 400 when the signature header is missing', async () => {
    const res = await POST(makeRequest(JSON.stringify(personCreated), { event: 'person_created' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await POST(
      makeRequest(JSON.stringify(personCreated), { signature: 'a'.repeat(40), event: 'person_created' })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, { signature: sign(body), event: 'person_created' }));
    expect(res.status).toBe(400);
  });
});
