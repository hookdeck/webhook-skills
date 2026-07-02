import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// The notification URL is part of the signed content, so tests must sign with
// the same value the route verifies against. Set env before importing the route.
const signatureKey = 'test_signature_key';
const notificationUrl = 'https://example.com/webhooks/square';

process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = signatureKey;
process.env.SQUARE_WEBHOOK_URL = notificationUrl;

// Import the route after env vars are set (the module reads them at load time).
let POST: (req: Request) => Promise<Response>;

beforeAll(async () => {
  const mod = await import('../app/webhooks/square/route');
  POST = mod.POST as unknown as (req: Request) => Promise<Response>;
});

/**
 * Generate a valid Square signature for testing:
 * base64(HMAC-SHA256(notificationUrl + body, signatureKey)).
 */
function generateSquareSignature(
  body: string,
  key = signatureKey,
  url = notificationUrl
): string {
  return crypto.createHmac('sha256', key).update(url + body).digest('base64');
}

function makeRequest(body: string, signature?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature !== undefined) {
    headers['x-square-hmacsha256-signature'] = signature;
  }
  return new Request(notificationUrl, { method: 'POST', body, headers });
}

describe('POST /webhooks/square', () => {
  it('returns 400 when the signature header is missing', async () => {
    const body = JSON.stringify({ type: 'payment.created' });
    const res = await POST(makeRequest(body));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Missing signature');
  });

  it('returns 400 for an invalid signature', async () => {
    const body = JSON.stringify({ type: 'payment.created' });
    const res = await POST(makeRequest(body, 'invalid_signature'));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  it('returns 400 when the body is tampered with', async () => {
    const original = JSON.stringify({ type: 'payment.updated', amount: 100 });
    const signature = generateSquareSignature(original);
    const tampered = JSON.stringify({ type: 'payment.updated', amount: 999 });

    const res = await POST(makeRequest(tampered, signature));
    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid signature', async () => {
    const body = JSON.stringify({
      type: 'payment.updated',
      event_id: 'evt_123',
      data: { id: 'pay_abc' },
    });
    const signature = generateSquareSignature(body);

    const res = await POST(makeRequest(body, signature));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('handles the common Square event types', async () => {
    const types = [
      'payment.created',
      'payment.updated',
      'refund.created',
      'refund.updated',
      'invoice.payment_made',
      'order.created',
      'order.updated',
      'customer.created',
    ];

    for (const type of types) {
      const body = JSON.stringify({ type, event_id: `evt_${type}`, data: { id: 'obj_1' } });
      const signature = generateSquareSignature(body);

      const res = await POST(makeRequest(body, signature));
      expect(res.status).toBe(200);
    }
  });
});
