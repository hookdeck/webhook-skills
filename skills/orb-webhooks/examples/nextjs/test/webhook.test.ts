import { describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';

vi.stubEnv('ORB_WEBHOOK_SECRET', 'test_webhook_secret');

import { verifyOrbSignature, isTimestampFresh } from '../app/webhooks/orb/route';

const webhookSecret = 'test_webhook_secret';

/**
 * Generate a valid Orb signature for testing.
 * Signed content: `v1:{timestamp}:{payload}`
 */
function generateOrbSignature(
  payload: string,
  secret: string,
  timestamp: string = new Date().toISOString()
): { signature: string; timestamp: string } {
  const signedContent = `v1:${timestamp}:${payload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedContent)
    .digest('hex');
  return { signature: `v1=${signature}`, timestamp };
}

describe('verifyOrbSignature', () => {
  it('accepts a valid signature', () => {
    const payload = '{"id":"evt_1","type":"invoice.issued"}';
    const { signature, timestamp } = generateOrbSignature(payload, webhookSecret);
    expect(verifyOrbSignature(payload, signature, timestamp, webhookSecret)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    expect(
      verifyOrbSignature(
        '{"id":"evt_1"}',
        'v1=deadbeef',
        new Date().toISOString(),
        webhookSecret
      )
    ).toBe(false);
  });

  it('rejects a missing signature header', () => {
    expect(verifyOrbSignature('{}', null, new Date().toISOString(), webhookSecret)).toBe(false);
  });

  it('rejects a missing timestamp', () => {
    expect(verifyOrbSignature('{}', 'v1=deadbeef', null, webhookSecret)).toBe(false);
  });

  it('rejects a tampered payload', () => {
    const original = '{"id":"evt_1","amount":100}';
    const { signature, timestamp } = generateOrbSignature(original, webhookSecret);
    const tampered = '{"id":"evt_1","amount":999}';
    expect(verifyOrbSignature(tampered, signature, timestamp, webhookSecret)).toBe(false);
  });

  it('accepts a signature when the v1= prefix is omitted', () => {
    const payload = '{"id":"evt_1"}';
    const { signature, timestamp } = generateOrbSignature(payload, webhookSecret);
    const bare = signature.slice(3);
    expect(verifyOrbSignature(payload, bare, timestamp, webhookSecret)).toBe(true);
  });
});

describe('isTimestampFresh', () => {
  it('accepts a current timestamp', () => {
    expect(isTimestampFresh(new Date().toISOString())).toBe(true);
  });

  it('rejects a timestamp older than the tolerance', () => {
    const old = new Date(Date.now() - 400 * 1000).toISOString();
    expect(isTimestampFresh(old)).toBe(false);
  });

  it('rejects a missing or unparseable timestamp', () => {
    expect(isTimestampFresh(null)).toBe(false);
    expect(isTimestampFresh('not-a-date')).toBe(false);
  });
});

describe('POST /webhooks/orb', () => {
  it('returns 400 for missing signature headers', async () => {
    const { POST } = await import('../app/webhooks/orb/route');
    const request = new Request('http://localhost/webhooks/orb', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    const response = await POST(request as never);
    expect(response.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const { POST } = await import('../app/webhooks/orb/route');
    const payload = JSON.stringify({ id: 'evt_test', type: 'invoice.issued' });
    const request = new Request('http://localhost/webhooks/orb', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Orb-Signature': 'v1=invalid_signature',
        'X-Orb-Timestamp': new Date().toISOString(),
      },
      body: payload,
    });

    const response = await POST(request as never);
    expect(response.status).toBe(400);
  });

  it('returns 400 for a stale timestamp', async () => {
    const { POST } = await import('../app/webhooks/orb/route');
    const payload = JSON.stringify({ id: 'evt_test', type: 'invoice.issued' });
    const staleTimestamp = new Date(Date.now() - 600 * 1000).toISOString();
    const { signature } = generateOrbSignature(payload, webhookSecret, staleTimestamp);

    const request = new Request('http://localhost/webhooks/orb', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Orb-Signature': signature,
        'X-Orb-Timestamp': staleTimestamp,
      },
      body: payload,
    });

    const response = await POST(request as never);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Timestamp');
  });

  it('returns 200 for a valid signature', async () => {
    const { POST } = await import('../app/webhooks/orb/route');
    const payload = JSON.stringify({
      id: 'evt_valid',
      type: 'invoice.issued',
      properties: { invoice_id: 'invoice_01' },
    });
    const { signature, timestamp } = generateOrbSignature(payload, webhookSecret);

    const request = new Request('http://localhost/webhooks/orb', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Orb-Signature': signature,
        'X-Orb-Timestamp': timestamp,
      },
      body: payload,
    });

    const response = await POST(request as never);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ received: true });
  });

  it('handles every documented event type', async () => {
    const { POST } = await import('../app/webhooks/orb/route');
    const eventTypes = [
      'customer.created',
      'customer.credit_balance_dropped',
      'subscription.created',
      'subscription.started',
      'subscription.ended',
      'subscription.plan_changed',
      'subscription.usage_exceeded',
      'invoice.issued',
      'invoice.payment_succeeded',
      'invoice.payment_failed',
      'data_exports.transfer_success',
      'unknown.event.type',
    ];

    for (const eventType of eventTypes) {
      const payload = JSON.stringify({
        id: `evt_${eventType.replace(/\./g, '_')}`,
        type: eventType,
        properties: {},
      });
      const { signature, timestamp } = generateOrbSignature(payload, webhookSecret);

      const request = new Request('http://localhost/webhooks/orb', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Orb-Signature': signature,
          'X-Orb-Timestamp': timestamp,
        },
        body: payload,
      });

      const response = await POST(request as never);
      expect(response.status).toBe(200);
    }
  });
});
