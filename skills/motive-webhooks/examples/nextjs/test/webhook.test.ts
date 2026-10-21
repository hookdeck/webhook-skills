import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { verifyMotiveSignature } from '../lib/verify-motive';
import { POST } from '../app/webhooks/motive/route';

// Motive secrets are 20-character strings, used as-is (no base64 decoding)
const SECRET = 'a1b2c3d4e5f6a7b8c9d0';

beforeEach(() => {
  process.env.MOTIVE_WEBHOOK_SECRET = SECRET;
});

/**
 * Sign like Motive: hex(HMAC-SHA1(secret, rawBody))
 */
function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha1', secret).update(body).digest('hex');
}

function makeRequest(body: string, signature?: string): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (signature) headers['X-KT-Webhook-Signature'] = signature;
  return new Request('http://localhost/webhooks/motive', {
    method: 'POST',
    headers,
    body,
  }) as unknown as NextRequest;
}

const faultOpened = {
  action: 'fault_code_opened',
  trigger: 'created',
  id: 123,
  code_label: 'SPN-5610',
  status: 'open',
  vehicle: { id: 1, number: 'T123', vin: 'ABC12345678909876' },
};

const locationUpdated = {
  action: 'vehicle_location_updated',
  trigger: 'updated',
  id: '5d3d5cf6-501f-4566-ad07-a80c05c743a7',
  vehicle_id: 123,
  vehicle_number: 'sample',
  lat: 34.123,
  lon: -84.123,
};

describe('verifyMotiveSignature', () => {
  it('matches the Motive docs test vector', () => {
    const secret = 'd9d36bea41c44ae49d1bfc4a48ba2abe';
    const body = '["fault_code_closed"]';
    const expected = 'f04a8386a21a6cba0447024e83b3f0983352bb72';
    expect(sign(body, secret)).toBe(expected);
    expect(verifyMotiveSignature(body, expected, secret)).toBe(true);
  });

  it('does not match when the signature is used as the key (docs sample bug)', () => {
    const body = '["fault_code_closed"]';
    const wrong = sign(body, 'f04a8386a21a6cba0447024e83b3f0983352bb72');
    expect(verifyMotiveSignature(body, wrong, 'd9d36bea41c44ae49d1bfc4a48ba2abe')).toBe(false);
  });

  it('accepts an uppercase hex signature', () => {
    const body = JSON.stringify(faultOpened);
    expect(verifyMotiveSignature(body, sign(body).toUpperCase(), SECRET)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const body = JSON.stringify(faultOpened);
    expect(verifyMotiveSignature(body + ' ', sign(body), SECRET)).toBe(false);
  });

  it('rejects a SHA-256 signature', () => {
    const body = JSON.stringify(faultOpened);
    const sha256 = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
    expect(verifyMotiveSignature(body, sha256, SECRET)).toBe(false);
  });

  it('rejects missing signature or secret and wrong length', () => {
    const body = JSON.stringify(faultOpened);
    expect(verifyMotiveSignature(body, null, SECRET)).toBe(false);
    expect(verifyMotiveSignature(body, sign(body), undefined)).toBe(false);
    expect(verifyMotiveSignature(body, 'abc', SECRET)).toBe(false);
  });
});

describe('POST /webhooks/motive', () => {
  it('returns 200 for a valid fault_code_opened event', async () => {
    const body = JSON.stringify(faultOpened);
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('returns 200 for a valid vehicle_location_updated event', async () => {
    const body = JSON.stringify(locationUpdated);
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
  });

  it('returns 200 for an unknown action', async () => {
    const body = JSON.stringify({ action: 'something_new', id: 1 });
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
  });

  it('returns 200 for the activation test body, which is not valid JSON', async () => {
    const body = '[vehicle_location_updated]';
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, ignored: true });
  });

  it('returns 403 for an invalid signature', async () => {
    const body = JSON.stringify(faultOpened);
    const res = await POST(makeRequest(body, 'f'.repeat(40)));
    expect(res.status).toBe(403);
  });

  it('returns 403 when the signature header is missing', async () => {
    const body = JSON.stringify(faultOpened);
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(403);
  });

  it('returns 403 when signed with a different secret', async () => {
    const body = JSON.stringify(faultOpened);
    const res = await POST(makeRequest(body, sign(body, 'ffffffffffffffffffff')));
    expect(res.status).toBe(403);
  });

  it('verifies the raw body, not re-serialized JSON', async () => {
    const body = '{ "action":  "fault_code_closed",\n  "id": 7 }';
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
  });
});
