import { describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';

// Lithic secrets are 'whsec_' + a base64-encoded key. Throwaway test key.
const WEBHOOK_SECRET = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
vi.stubEnv('LITHIC_WEBHOOK_SECRET', WEBHOOK_SECRET);
vi.stubEnv('LITHIC_API_KEY', 'test-api-key');

/**
 * Generate a valid Lithic (Standard Webhooks) signature for testing.
 *
 * Signed content is `{webhook-id}.{webhook-timestamp}.{payload}` and the HMAC
 * key is the base64-decoded portion of the secret after the `whsec_` prefix.
 */
function signPayload(
  payload: string,
  secret: string = WEBHOOK_SECRET,
  timestamp: number = Math.floor(Date.now() / 1000)
): Record<string, string> {
  const id = `msg_${crypto.randomBytes(6).toString('hex')}`;
  const ts = String(timestamp);
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const signature = crypto
    .createHmac('sha256', key)
    .update(`${id}.${ts}.${payload}`)
    .digest('base64');
  return {
    'Content-Type': 'application/json',
    'webhook-id': id,
    'webhook-timestamp': ts,
    'webhook-signature': `v1,${signature}`,
  };
}

const EVENT_TYPES = [
  'card.created',
  'card.updated',
  'card_transaction.updated',
  'payment_transaction.created',
  'payment_transaction.updated',
  'dispute.updated',
  'balance.updated',
  'three_ds_authentication.created',
  'account_holder.created', // unhandled -> still 200
];

describe('POST /webhooks/lithic', () => {
  it('returns 400 when signature headers are missing', async () => {
    const { POST } = await import('../app/webhooks/lithic/route');
    const request = new Request('http://localhost/webhooks/lithic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    const response = await POST(request as never);
    expect(response.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const { POST } = await import('../app/webhooks/lithic/route');
    const payload = JSON.stringify({ token: 'evt_1', event_type: 'card.created' });
    const request = new Request('http://localhost/webhooks/lithic', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'webhook-id': 'msg_1',
        'webhook-timestamp': String(Math.floor(Date.now() / 1000)),
        'webhook-signature': 'v1,invalidsignature',
      },
      body: payload,
    });

    const response = await POST(request as never);
    expect(response.status).toBe(400);
  });

  it('returns 400 for a tampered payload', async () => {
    const { POST } = await import('../app/webhooks/lithic/route');
    const original = JSON.stringify({ token: 'evt_1', event_type: 'card.created', amount: 100 });
    const headers = signPayload(original);
    const tampered = JSON.stringify({ token: 'evt_1', event_type: 'card.created', amount: 999 });

    const request = new Request('http://localhost/webhooks/lithic', {
      method: 'POST',
      headers,
      body: tampered,
    });

    const response = await POST(request as never);
    expect(response.status).toBe(400);
  });

  it('returns 400 for a stale timestamp (replay protection)', async () => {
    const { POST } = await import('../app/webhooks/lithic/route');
    const payload = JSON.stringify({ token: 'evt_1', event_type: 'card.created' });
    const staleTs = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
    const headers = signPayload(payload, WEBHOOK_SECRET, staleTs);

    const request = new Request('http://localhost/webhooks/lithic', {
      method: 'POST',
      headers,
      body: payload,
    });

    const response = await POST(request as never);
    expect(response.status).toBe(400);
  });

  it('returns 200 for a valid signature', async () => {
    const { POST } = await import('../app/webhooks/lithic/route');
    const payload = JSON.stringify({
      event_type: 'card.created',
      card_token: '00000000-0000-0000-0000-000000000001',
      replacement_for: null,
    });
    const headers = signPayload(payload);

    const request = new Request('http://localhost/webhooks/lithic', {
      method: 'POST',
      headers,
      body: payload,
    });

    const response = await POST(request as never);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ received: true });
  });

  it('handles every documented event type', async () => {
    const { POST } = await import('../app/webhooks/lithic/route');
    for (const eventType of EVENT_TYPES) {
      const payload = JSON.stringify({
        event_type: eventType,
        token: 'obj_1',
      });
      const headers = signPayload(payload);

      const request = new Request('http://localhost/webhooks/lithic', {
        method: 'POST',
        headers,
        body: payload,
      });

      const response = await POST(request as never);
      expect(response.status).toBe(200);
    }
  });
});
