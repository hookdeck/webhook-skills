import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { verifyRampSignature } from '../lib/verify-ramp';
import { POST } from '../app/webhooks/ramp/route';

// Ramp returns the secret as a raw string; it is used as-is (not decoded)
const SECRET = 'test_ramp_webhook_secret';

beforeEach(() => {
  process.env.RAMP_WEBHOOK_SECRET = SECRET;
});

/**
 * Sign like Ramp: hex(HMAC-SHA256(secret, rawBody))
 */
function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

function makeRequest(body: string, signature?: string): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (signature) headers['X-Ramp-Signature'] = signature;
  return new Request('http://localhost/webhooks/ramp', {
    method: 'POST',
    headers,
    body,
  }) as unknown as NextRequest;
}

const clearedEvent = {
  id: 'evt_0b1c2d3e',
  type: 'transactions.cleared',
  created_at: '2026-10-21T10:15:00Z',
  business_id: 'biz_123',
  object: { id: 'a1b2c3d4-0000-0000-0000-000000000001' },
};

describe('verifyRampSignature', () => {
  it('accepts a valid signature', () => {
    const body = JSON.stringify(clearedEvent);
    expect(verifyRampSignature(body, sign(body), SECRET)).toBe(true);
  });

  it('produces a 64-char hex HMAC-SHA256 digest', () => {
    expect(sign('{}')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects a tampered body', () => {
    const body = JSON.stringify(clearedEvent);
    expect(verifyRampSignature(body + ' ', sign(body), SECRET)).toBe(false);
  });

  it('rejects a wrong secret', () => {
    const body = JSON.stringify(clearedEvent);
    expect(verifyRampSignature(body, sign(body, 'other'), SECRET)).toBe(false);
  });

  it('rejects a signature of the wrong length', () => {
    expect(verifyRampSignature('{}', 'abcd', SECRET)).toBe(false);
  });

  it('rejects missing signature or secret', () => {
    expect(verifyRampSignature('{}', undefined, SECRET)).toBe(false);
    expect(verifyRampSignature('{}', sign('{}'), undefined)).toBe(false);
  });
});

describe('POST /webhooks/ramp', () => {
  it('accepts a signed transactions.cleared event', async () => {
    const body = JSON.stringify(clearedEvent);
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts a signed webhooks.verification challenge', async () => {
    const body = JSON.stringify({ type: 'webhooks.verification', challenge: 'challenge_abc123' });
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
  });

  it.each([
    'transactions.authorized',
    'transactions.declined',
    'reimbursements.ready_for_review',
    'bills.created',
    'bills.approved',
    'bills.paid',
    'tests.test_event',
    'vendors.updated',
  ])('accepts a signed %s event', async (type) => {
    const body = JSON.stringify({ ...clearedEvent, type });
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature with 400', async () => {
    const res = await POST(makeRequest(JSON.stringify(clearedEvent)));
    expect(res.status).toBe(400);
  });

  it('rejects an invalid signature with 400', async () => {
    const body = JSON.stringify(clearedEvent);
    const res = await POST(makeRequest(body, sign(body, 'wrong_secret')));
    expect(res.status).toBe(400);
  });

  it('rejects a signed but invalid JSON body with 400', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(400);
  });

  it('verifies the exact raw bytes, not re-serialized JSON', async () => {
    const body = '{ "id":"evt_1",  "type":"bills.paid", "object":{"id":"x"} }';
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
  });
});
