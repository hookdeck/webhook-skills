import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/airwallex/route';

const WEBHOOK_SECRET = 'test_secret';

beforeAll(() => {
  process.env.AIRWALLEX_WEBHOOK_SECRET = WEBHOOK_SECRET;
});

/**
 * Generate a valid Airwallex signature for testing.
 * HMAC-SHA256 over (x-timestamp + raw_body), hex-encoded.
 */
function sign(payload: string, secret: string, timestamp = String(Date.now())) {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(timestamp)
    .update(payload)
    .digest('hex');
  return { timestamp, signature };
}

function eventPayload(name: string, objectId = 'int_test_123'): string {
  return JSON.stringify({
    id: 'evt_test_123',
    name,
    account_id: 'acct_test_123',
    data: { object: { id: objectId, status: 'SUCCEEDED' } },
    created_at: '2026-07-24T12:34:56+0000',
  });
}

function makeRequest(payload: string, headers: Record<string, string>): NextRequest {
  return new Request('http://localhost/webhooks/airwallex', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: payload,
  }) as unknown as NextRequest;
}

describe('Airwallex webhook route', () => {
  it('returns 400 when signature headers are missing', async () => {
    const res = await POST(makeRequest(eventPayload('payment_intent.succeeded'), {}));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const payload = eventPayload('payment_intent.succeeded');
    const res = await POST(
      makeRequest(payload, {
        'x-timestamp': String(Date.now()),
        'x-signature': 'deadbeef',
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for a tampered payload', async () => {
    const original = eventPayload('payment_intent.succeeded', 'int_original');
    const { timestamp, signature } = sign(original, WEBHOOK_SECRET);
    const tampered = eventPayload('payment_intent.succeeded', 'int_tampered');
    const res = await POST(
      makeRequest(tampered, { 'x-timestamp': timestamp, 'x-signature': signature })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when the timestamp is outside tolerance', async () => {
    const payload = eventPayload('payment_intent.succeeded');
    const oldTimestamp = String(Date.now() - 10 * 60 * 1000);
    const { signature } = sign(payload, WEBHOOK_SECRET, oldTimestamp);
    const res = await POST(
      makeRequest(payload, { 'x-timestamp': oldTimestamp, 'x-signature': signature })
    );
    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid signature', async () => {
    const payload = eventPayload('payment_intent.succeeded');
    const { timestamp, signature } = sign(payload, WEBHOOK_SECRET);
    const res = await POST(
      makeRequest(payload, { 'x-timestamp': timestamp, 'x-signature': signature })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('handles the documented event types', async () => {
    const names = [
      'payment_intent.succeeded',
      'payment_attempt.paid',
      'refund.settled',
      'refund.failed',
      'payment_consent.verified',
      'payment_dispute.requires_response',
      'some.unhandled.event',
    ];
    for (const name of names) {
      const payload = eventPayload(name);
      const { timestamp, signature } = sign(payload, WEBHOOK_SECRET);
      const res = await POST(
        makeRequest(payload, { 'x-timestamp': timestamp, 'x-signature': signature })
      );
      expect(res.status).toBe(200);
    }
  });
});
