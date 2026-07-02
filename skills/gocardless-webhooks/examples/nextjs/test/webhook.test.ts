import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

beforeAll(() => {
  process.env.GOCARDLESS_WEBHOOK_SECRET = 'test_webhook_secret';
});

// Import after env vars are set
import { POST } from '../app/webhooks/gocardless/route';
import { NextRequest } from 'next/server';

const WEBHOOK_SECRET = 'test_webhook_secret';

/**
 * Generate a valid GoCardless Webhook-Signature: HMAC-SHA256 (hex) over the raw body,
 * exactly how GoCardless (and the gocardless-nodejs SDK) sign requests.
 */
function sign(rawBody: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

function eventsBody(events: unknown[]): string {
  return JSON.stringify({ events });
}

function makeRequest(body: string, signature?: string): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (signature !== undefined) {
    headers['Webhook-Signature'] = signature;
  }
  return new NextRequest('http://localhost:3000/webhooks/gocardless', {
    method: 'POST',
    headers,
    body,
  });
}

describe('POST /webhooks/gocardless', () => {
  it('returns 204 for a valid signature', async () => {
    const body = eventsBody([
      {
        id: 'EV123',
        created_at: '2014-08-04T12:00:00.000Z',
        resource_type: 'payments',
        action: 'confirmed',
        links: { payment: 'PM123' },
      },
    ]);

    const response = await POST(makeRequest(body, sign(body, WEBHOOK_SECRET)));
    expect(response.status).toBe(204);
  });

  it('processes a batch of multiple events', async () => {
    const body = eventsBody([
      { id: 'EV1', resource_type: 'payments', action: 'failed', links: { payment: 'PM1' } },
      { id: 'EV2', resource_type: 'mandates', action: 'cancelled', links: { mandate: 'MD1' } },
      { id: 'EV3', resource_type: 'payouts', action: 'paid', links: { payout: 'PO1' } },
    ]);

    const response = await POST(makeRequest(body, sign(body, WEBHOOK_SECRET)));
    expect(response.status).toBe(204);
  });

  it('returns 498 for an invalid signature', async () => {
    const body = eventsBody([
      { id: 'EV123', resource_type: 'payments', action: 'confirmed', links: {} },
    ]);

    const response = await POST(makeRequest(body, 'deadbeef'));
    expect(response.status).toBe(498);
  });

  it('returns 498 for a signature made with the wrong secret', async () => {
    const body = eventsBody([
      { id: 'EV123', resource_type: 'payments', action: 'confirmed', links: {} },
    ]);

    const response = await POST(makeRequest(body, sign(body, 'the_wrong_secret')));
    expect(response.status).toBe(498);
  });

  it('returns 498 when the signature header is missing', async () => {
    const body = eventsBody([
      { id: 'EV123', resource_type: 'payments', action: 'confirmed', links: {} },
    ]);

    const response = await POST(makeRequest(body));
    expect(response.status).toBe(498);
  });

  it('is verified against the RAW body (tampering breaks the signature)', async () => {
    const body = eventsBody([
      { id: 'EV123', resource_type: 'payments', action: 'confirmed', links: {} },
    ]);
    const signature = sign(body, WEBHOOK_SECRET);
    const tampered = eventsBody([
      { id: 'EV123', resource_type: 'payments', action: 'paid_out', links: {} },
    ]);

    const response = await POST(makeRequest(tampered, signature));
    expect(response.status).toBe(498);
  });
});
