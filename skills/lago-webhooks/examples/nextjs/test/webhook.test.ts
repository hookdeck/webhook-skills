import { describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const secret = 'test_hmac_signature_token';
vi.stubEnv('LAGO_HMAC_KEY', secret);

import { verifyLagoSignature } from '../lib/lago';
import { POST } from '../app/webhooks/lago/route';

/** Lago HMAC signature: base64 HMAC-SHA256 of the raw body. */
function generateLagoSignature(payload: string, key: string = secret): string {
  return crypto.createHmac('sha256', key).update(payload).digest('base64');
}

function makeRequest(payload: string, headers: Record<string, string> = {}, contentType = 'application/json') {
  return new NextRequest('http://localhost:3000/webhooks/lago', {
    method: 'POST',
    headers: { 'content-type': contentType, 'x-lago-signature-algorithm': 'hmac', ...headers },
    body: payload,
  });
}

describe('verifyLagoSignature', () => {
  const payload = '{"webhook_type":"invoice.created"}';

  it('accepts a valid signature', () => {
    expect(verifyLagoSignature(payload, generateLagoSignature(payload), secret)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    expect(verifyLagoSignature(payload, 'invalid', secret)).toBe(false);
  });

  it('rejects a missing signature or secret', () => {
    expect(verifyLagoSignature(payload, null, secret)).toBe(false);
    expect(verifyLagoSignature(payload, generateLagoSignature(payload), '')).toBe(false);
  });

  it('rejects a tampered payload', () => {
    const signature = generateLagoSignature(payload);
    expect(verifyLagoSignature('{"webhook_type":"invoice.voided"}', signature, secret)).toBe(false);
  });

  it('rejects a signature made with the wrong key', () => {
    expect(verifyLagoSignature(payload, generateLagoSignature(payload, 'other'), secret)).toBe(false);
  });
});

describe('POST /webhooks/lago', () => {
  it('returns 400 for a missing signature header', async () => {
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await POST(makeRequest('{}', { 'x-lago-signature': 'invalid' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  it('returns 400 when the endpoint uses the jwt algorithm', async () => {
    const payload = JSON.stringify({ webhook_type: 'invoice.created' });
    const res = await POST(
      makeRequest(payload, { 'x-lago-signature': generateLagoSignature(payload), 'x-lago-signature-algorithm': 'jwt' })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for a tampered payload', async () => {
    const original = JSON.stringify({ webhook_type: 'invoice.created', amount: 100 });
    const tampered = JSON.stringify({ webhook_type: 'invoice.created', amount: 999 });
    const res = await POST(makeRequest(tampered, { 'x-lago-signature': generateLagoSignature(original) }));
    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid signature', async () => {
    const payload = JSON.stringify({
      webhook_type: 'invoice.created',
      object_type: 'invoice',
      organization_id: 'org_1',
      invoice: { lago_id: 'inv_1' },
    });
    const res = await POST(
      makeRequest(payload, { 'x-lago-signature': generateLagoSignature(payload), 'x-lago-unique-key': 'key-1' })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies regardless of content type', async () => {
    const payload = JSON.stringify({ webhook_type: 'customer.created', object_type: 'customer', customer: {} });
    const res = await POST(makeRequest(payload, { 'x-lago-signature': generateLagoSignature(payload) }, 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('handles every documented event type', async () => {
    const events = [
      'invoice.created',
      'invoice.payment_status_updated',
      'subscription.started',
      'subscription.terminated',
      'customer.created',
      'wallet.depleted_ongoing_balance',
      'unknown.event.type',
    ];
    for (const webhook_type of events) {
      const payload = JSON.stringify({ webhook_type, object_type: 'thing', organization_id: 'org_1', thing: {} });
      const res = await POST(makeRequest(payload, { 'x-lago-signature': generateLagoSignature(payload) }));
      expect(res.status).toBe(200);
    }
  });
});
