import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Set test environment variables before importing the route.
beforeAll(() => {
  process.env.COINBASE_COMMERCE_WEBHOOK_SECRET = 'test_shared_secret';
});

const webhookSecret = 'test_shared_secret';

/**
 * Generate a valid Coinbase Commerce signature for testing.
 * Coinbase Commerce signs the raw body with HMAC-SHA256 (hex).
 */
function generateSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

/**
 * Build a Coinbase Commerce webhook body with the event nested under `event`.
 */
function buildBody(type: string, chargeId = 'charge_123'): string {
  return JSON.stringify({
    id: 'notification_123',
    scheduled_for: '2023-08-30T19:29:20Z',
    event: {
      id: 'evt_123',
      resource: 'event',
      type,
      api_version: '2018-03-22',
      created_at: '2023-08-30T19:29:20Z',
      data: { id: chargeId, code: 'XA6G6ZFR' },
    },
  });
}

function makeRequest(body: string, signature?: string): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (signature !== undefined) {
    headers['X-CC-Webhook-Signature'] = signature;
  }
  return new NextRequest('http://localhost:3000/webhooks/coinbase-commerce', {
    method: 'POST',
    headers,
    body,
  });
}

describe('POST /webhooks/coinbase-commerce', () => {
  it('returns 400 when the signature header is missing', async () => {
    const { POST } = await import('../app/webhooks/coinbase-commerce/route');
    const res = await POST(makeRequest(buildBody('charge:confirmed')));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const { POST } = await import('../app/webhooks/coinbase-commerce/route');
    const res = await POST(makeRequest(buildBody('charge:confirmed'), 'deadbeef'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a tampered payload', async () => {
    const { POST } = await import('../app/webhooks/coinbase-commerce/route');
    const original = buildBody('charge:confirmed', 'charge_original');
    const signature = generateSignature(original, webhookSecret);
    const tampered = buildBody('charge:confirmed', 'charge_tampered');
    const res = await POST(makeRequest(tampered, signature));
    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid signature', async () => {
    const { POST } = await import('../app/webhooks/coinbase-commerce/route');
    const body = buildBody('charge:confirmed');
    const signature = generateSignature(body, webhookSecret);
    const res = await POST(makeRequest(body, signature));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('handles all charge event types', async () => {
    const { POST } = await import('../app/webhooks/coinbase-commerce/route');
    const eventTypes = [
      'charge:created',
      'charge:pending',
      'charge:confirmed',
      'charge:failed',
      'charge:delayed',
      'charge:resolved',
      'charge:unknown',
    ];

    for (const type of eventTypes) {
      const body = buildBody(type);
      const signature = generateSignature(body, webhookSecret);
      const res = await POST(makeRequest(body, signature));
      expect(res.status).toBe(200);
    }
  });
});
