import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import { POST } from '../app/webhooks/recurly/route';
import { verifyRecurlySignature } from '../app/webhooks/recurly/verify';

beforeAll(() => {
  process.env.RECURLY_WEBHOOK_SECRET = 'test_endpoint_secret';
  // Ensure Basic Auth is not enforced in these tests
  delete process.env.RECURLY_WEBHOOK_USER;
  delete process.env.RECURLY_WEBHOOK_PASSWORD;
});

const WEBHOOK_SECRET = 'test_endpoint_secret';

/**
 * Generate a valid Recurly signature header for testing.
 * HMAC-SHA256 over `${timestamp}.${rawBody}`, hex-encoded → "<timestamp>,<sig>".
 */
function generateRecurlySignature(payload: string, secret: string, timestamp = '1659641851000'): string {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  return `${timestamp},${signature}`;
}

function post(body: string, headers: Record<string, string>): Request {
  return new Request('http://localhost/webhooks/recurly', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });
}

const newSubscriptionPayload = JSON.stringify({
  new_subscription_notification: {
    account: { account_code: '1', email: 'verena@example.com' },
    subscription: { uuid: '8435b96eb70e5640a0eaf82d0e0d6d', state: 'active' },
  },
});

describe('Recurly signature verification', () => {
  it('accepts a valid signature', () => {
    const header = generateRecurlySignature(newSubscriptionPayload, WEBHOOK_SECRET);
    expect(verifyRecurlySignature(newSubscriptionPayload, header, WEBHOOK_SECRET)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    expect(
      verifyRecurlySignature(newSubscriptionPayload, '1659641851000,deadbeef', WEBHOOK_SECRET)
    ).toBe(false);
  });

  it('rejects a tampered payload', () => {
    const header = generateRecurlySignature(newSubscriptionPayload, WEBHOOK_SECRET);
    const tampered = JSON.stringify({ new_subscription_notification: { subscription: { uuid: 'x' } } });
    expect(verifyRecurlySignature(tampered, header, WEBHOOK_SECRET)).toBe(false);
  });

  it('accepts any one of multiple signatures (key rotation)', () => {
    const timestamp = '1659641851000';
    const valid = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(`${timestamp}.${newSubscriptionPayload}`)
      .digest('hex');
    const header = `${timestamp},${'0'.repeat(64)},${valid}`;
    expect(verifyRecurlySignature(newSubscriptionPayload, header, WEBHOOK_SECRET)).toBe(true);
  });
});

describe('POST /webhooks/recurly', () => {
  it('returns 400 when the signature header is missing', async () => {
    const res = await POST(post(newSubscriptionPayload, {}) as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await POST(
      post(newSubscriptionPayload, { 'recurly-signature': '1659641851000,deadbeef' }) as any
    );
    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid signature', async () => {
    const header = generateRecurlySignature(newSubscriptionPayload, WEBHOOK_SECRET);
    const res = await POST(post(newSubscriptionPayload, { 'recurly-signature': header }) as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('handles different notification types', async () => {
    const types = [
      'new_subscription_notification',
      'updated_subscription_notification',
      'canceled_subscription_notification',
      'expired_subscription_notification',
      'renewed_subscription_notification',
      'successful_payment_notification',
      'failed_payment_notification',
      'unknown_notification',
    ];

    for (const type of types) {
      const body = JSON.stringify({ [type]: { subscription: { uuid: 's' }, transaction: { uuid: 't' } } });
      const header = generateRecurlySignature(body, WEBHOOK_SECRET);
      const res = await POST(post(body, { 'recurly-signature': header }) as any);
      expect(res.status).toBe(200);
    }
  });
});
