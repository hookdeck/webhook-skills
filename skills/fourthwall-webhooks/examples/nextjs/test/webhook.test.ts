import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { verifyFourthwallSignature } from '../lib/verify';

// Fourthwall shop secret keys are UUID-like strings, used as UTF-8 text
const SECRET = 'e3f93c7c-c92b-4b8f-a9b1-5b70e0891abc';

let POST: (request: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.FOURTHWALL_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/fourthwall/route'));
});

/**
 * Generate a valid Fourthwall signature: base64(HMAC-SHA256(secret, raw body))
 */
function sign(payload: string, secret: string = SECRET): string {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('base64');
}

function makeEvent(type: string, data: Record<string, unknown> = {}): string {
  return JSON.stringify({
    testMode: false,
    id: 'weve_geAva6c1RAuyb9HQxbSlmA',
    webhookId: 'wcon_P-VkRfmJTBaC6_Tst22cew',
    shopId: 'sh_7ad0c438-beda-4779-a885-0dc325a755c1',
    type,
    apiVersion: 'V1_BETA',
    createdAt: '2023-07-12T15:05:11.078089+00:00',
    data,
  });
}

function makeRequest(body: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/fourthwall', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('verifyFourthwallSignature', () => {
  const payload = '{"id":"weve_1"}';

  it('returns true for a valid signature', () => {
    expect(verifyFourthwallSignature(payload, sign(payload), SECRET)).toBe(true);
  });

  it('returns false for a signature made with another secret', () => {
    expect(verifyFourthwallSignature(payload, sign(payload, 'other-secret'), SECRET)).toBe(false);
  });

  it('returns false for a tampered body', () => {
    expect(verifyFourthwallSignature('{"id":"weve_2"}', sign(payload), SECRET)).toBe(false);
  });

  it('returns false for a missing or wrong-length signature', () => {
    expect(verifyFourthwallSignature(payload, null, SECRET)).toBe(false);
    expect(verifyFourthwallSignature(payload, 'short', SECRET)).toBe(false);
  });

  it('rejects a hex digest (Fourthwall uses base64)', () => {
    const hex = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
    expect(verifyFourthwallSignature(payload, hex, SECRET)).toBe(false);
  });
});

describe('POST /webhooks/fourthwall', () => {
  it('returns 400 for a missing signature', async () => {
    const response = await POST(makeRequest(makeEvent('ORDER_PLACED')));
    expect(response.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const response = await POST(
      makeRequest(makeEvent('ORDER_PLACED'), { 'x-fourthwall-hmac-sha256': 'invalid_signature' })
    );
    expect(response.status).toBe(400);
  });

  it('returns 200 for a valid signature', async () => {
    const payload = makeEvent('ORDER_PLACED', { friendlyId: 'D3XZY7DR' });
    const response = await POST(makeRequest(payload, { 'x-fourthwall-hmac-sha256': sign(payload) }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
  });

  it('verifies the exact bytes received, not re-serialized JSON', async () => {
    const payload = '{ "id": "weve_1",   "type": "DONATION", "data": {} }';
    const response = await POST(makeRequest(payload, { 'x-fourthwall-hmac-sha256': sign(payload) }));

    expect(response.status).toBe(200);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const payload = 'not json';
    const response = await POST(makeRequest(payload, { 'x-fourthwall-hmac-sha256': sign(payload) }));

    expect(response.status).toBe(400);
  });

  it('handles each known event type', async () => {
    const types = [
      'ORDER_PLACED',
      'ORDER_UPDATED',
      'GIFT_PURCHASE',
      'DONATION',
      'SUBSCRIPTION_PURCHASED',
      'SUBSCRIPTION_CHANGED',
      'SUBSCRIPTION_EXPIRED',
      'PRODUCT_CREATED',
      'PRODUCT_UPDATED',
      'NEWSLETTER_SUBSCRIBED', // not handled explicitly: still acknowledged
    ];

    for (const type of types) {
      const payload = makeEvent(type, { id: 'x' });
      const response = await POST(makeRequest(payload, { 'x-fourthwall-hmac-sha256': sign(payload) }));
      expect(response.status).toBe(200);
    }
  });
});
