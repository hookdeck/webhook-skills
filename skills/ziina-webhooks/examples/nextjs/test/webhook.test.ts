import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';

const SECRET = 'test_ziina_secret';
process.env.ZIINA_WEBHOOK_SECRET = SECRET;

import { POST } from '../app/webhooks/ziina/route';

// Based on the payload shown in Ziina's docs.
const paymentIntent = {
  event: 'payment_intent.status.updated',
  data: {
    id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    account_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    amount: 1050,
    tip_amount: 0,
    vat_amount: 0,
    currency_code: 'AED',
    created_at: '1712345678901',
    status: 'completed',
    operation_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    settled: { amount: 1050, tip_amount: 0, vat_amount: 0, currency_code: 'AED' },
    card_details: { card_last_four: '6789', card_brand: 'mastercard', card_funding_type: 'credit' },
  },
};
const refund = { event: 'refund.status.updated', data: { id: 'r-1', status: 'completed' } };

// Ziina: lowercase hex HMAC-SHA256 of the raw body, no prefix.
function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function makeRequest(body: string, signature?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature !== undefined) headers['x-hmac-signature'] = signature;
  return new Request('http://localhost/webhooks/ziina', { method: 'POST', headers, body });
}

describe('Ziina webhook', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('accepts a valid signature (payment intent)', async () => {
    const body = JSON.stringify(paymentIntent);
    expect((await POST(makeRequest(body, sign(body)))).status).toBe(200);
  });

  it('accepts a valid signature (refund)', async () => {
    const body = JSON.stringify(refund);
    expect((await POST(makeRequest(body, sign(body)))).status).toBe(200);
  });

  it('accepts an uppercase hex signature', async () => {
    const body = JSON.stringify(paymentIntent);
    expect((await POST(makeRequest(body, sign(body).toUpperCase()))).status).toBe(200);
  });

  it('verifies the exact bytes, not re-serialised JSON', async () => {
    const body = '{ "event" : "refund.status.updated",\n  "data": {"id":"r-2","status":"completed"} }';
    expect((await POST(makeRequest(body, sign(body)))).status).toBe(200);
  });

  it('accepts an unrecognised event type', async () => {
    const body = JSON.stringify({ event: 'something.else', data: {} });
    expect((await POST(makeRequest(body, sign(body)))).status).toBe(200);
  });

  it('rejects a missing signature', async () => {
    expect((await POST(makeRequest(JSON.stringify(paymentIntent)))).status).toBe(401);
  });

  it('rejects an empty signature', async () => {
    expect((await POST(makeRequest(JSON.stringify(paymentIntent), ''))).status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = JSON.stringify(paymentIntent);
    expect((await POST(makeRequest(body, sign(body, 'other_secret')))).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(paymentIntent);
    const sig = sign(body);
    expect((await POST(makeRequest(body.replace('1050', '9999'), sig))).status).toBe(401);
  });

  it('rejects a prefixed or malformed signature', async () => {
    const body = JSON.stringify(paymentIntent);
    const sig = sign(body);
    for (const bad of [`sha256=${sig}`, sig.slice(0, 62), `${sig}00`, `zz${sig.slice(2)}`]) {
      expect((await POST(makeRequest(body, bad))).status).toBe(401);
    }
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const body = 'not json';
    expect((await POST(makeRequest(body, sign(body)))).status).toBe(400);
  });
});
