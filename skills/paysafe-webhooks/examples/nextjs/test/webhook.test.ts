import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const SECRET = 'test-secret-key'; // Paysafe HMAC keys are used as raw UTF-8 strings

let POST: (req: NextRequest) => Promise<Response>;
let verifyPaysafeWebhook: (body: string, sig: string | null, secret: string | undefined) => boolean;

beforeAll(async () => {
  process.env.PAYSAFE_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/paysafe/route'));
  ({ verifyPaysafeWebhook } = await import('../lib/verify'));
});

function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('base64');
}

function makeEvent(eventName: string): string {
  return JSON.stringify({
    payload: { id: 'a49ba790-9cc5-4502-9f4a-dccc72460cf1', status: 'COMPLETED' },
    attemptNumber: 1,
    type: 'PAYMENT_HANDLE',
    resourceId: 'a49ba790-9cc5-4502-9f4a-dccc72460cf1',
    links: [{ rel: 'payment_handle', href: 'https://api.paysafe.com/paymenthub/v1/paymenthandles/a49ba790' }],
    eventDate: '2026-01-15T10:00:00Z',
    eventName,
  }, null, 2); // pretty-printed: the signature covers the exact bytes received
}

function makeRequest(body: string, signature?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature) headers['signature'] = signature;
  return new NextRequest('http://localhost:3000/webhooks/paysafe', { method: 'POST', headers, body });
}

describe('verifyPaysafeWebhook', () => {
  const body = makeEvent('PAYMENT_HANDLE_COMPLETED');

  it('accepts a valid signature', () => {
    expect(verifyPaysafeWebhook(body, sign(body), SECRET)).toBe(true);
  });

  it('rejects a wrong secret, tampered body, or malformed signature', () => {
    expect(verifyPaysafeWebhook(body, sign(body, 'other'), SECRET)).toBe(false);
    expect(verifyPaysafeWebhook(body + ' ', sign(body), SECRET)).toBe(false);
    expect(verifyPaysafeWebhook(body, 'short', SECRET)).toBe(false);
    expect(verifyPaysafeWebhook(body, null, SECRET)).toBe(false);
  });

  it('does not base64-decode the key', () => {
    const sig = crypto.createHmac('sha256', Buffer.from(SECRET, 'base64')).update(body).digest('base64');
    expect(verifyPaysafeWebhook(body, sig, SECRET)).toBe(false);
  });
});

describe('POST /webhooks/paysafe', () => {
  it.each([
    'PAYMENT_HANDLE_COMPLETED',
    'PAYMENT_HANDLE_FAILED',
    'PAYMENT_COMPLETED',
    'SETTLEMENT_COMPLETED',
    'SOMETHING_NEW',
  ])('returns 200 for a valid %s event', async (eventName) => {
    const body = makeEvent(eventName);
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
  });

  it('verifies regardless of content type', async () => {
    const body = makeEvent('PAYMENT_COMPLETED');
    const res = await POST(makeRequest(body, sign(body), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 400 for an invalid signature', async () => {
    const body = makeEvent('PAYMENT_COMPLETED');
    const res = await POST(makeRequest(body, sign(body, 'wrong-key')));
    expect(res.status).toBe(400);
  });

  it('returns 400 when the Signature header is missing', async () => {
    const res = await POST(makeRequest(makeEvent('PAYMENT_COMPLETED')));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a validly signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, sign(body), 'text/plain'));
    expect(res.status).toBe(400);
  });
});
