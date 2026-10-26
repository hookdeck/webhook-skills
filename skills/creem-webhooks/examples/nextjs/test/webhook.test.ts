import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/creem/route';
import { verifyCreemSignature } from '../lib/verify-creem';

const SECRET = 'whsec_test_creem_secret_0123456789';

beforeAll(() => {
  process.env.CREEM_WEBHOOK_SECRET = SECRET;
});

// Shape follows Creem's documented samples: top-level id (evt_...), eventType, created_at and
// the resource under `object`.
function samplePayload(eventType = 'checkout.completed') {
  return {
    id: 'evt_5WHHcZPv7VS0YUsberIuOz',
    eventType,
    created_at: 1728734325927,
    object: { id: 'ch_4l0N34kxo16AhRKUHFUuXr', object: 'checkout', status: 'completed' },
  };
}

// creem-signature = lowercase hex HMAC-SHA256 of the raw body, keyed with the signing secret
function sign(body: string | Buffer, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/creem', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/creem', () => {
  it('accepts a valid signature', async () => {
    const body = JSON.stringify(samplePayload());
    const res = await POST(makeRequest({ 'creem-signature': sign(body) }, body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts an uppercase hex signature', async () => {
    const body = JSON.stringify(samplePayload());
    const res = await POST(makeRequest({ 'creem-signature': sign(body).toUpperCase() }, body));
    expect(res.status).toBe(200);
  });

  it('verifies regardless of content type', async () => {
    const body = JSON.stringify(samplePayload());
    const res = await POST(makeRequest({ 'creem-signature': sign(body) }, body, 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('verifies the exact bytes received, including odd whitespace', async () => {
    const body = '{ "eventType" :   "checkout.completed" }\n';
    const res = await POST(makeRequest({ 'creem-signature': sign(body) }, body));
    expect(res.status).toBe(200);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = JSON.stringify(samplePayload());
    const res = await POST(makeRequest({ 'creem-signature': sign(body, 'wrong_secret') }, body));
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const signed = JSON.stringify(samplePayload());
    const tampered = JSON.stringify(samplePayload('refund.created'));
    const res = await POST(makeRequest({ 'creem-signature': sign(signed) }, tampered));
    expect(res.status).toBe(401);
  });

  it('rejects a random 64-hex signature', async () => {
    const random = crypto.randomBytes(32).toString('hex');
    const res = await POST(makeRequest({ 'creem-signature': random }));
    expect(res.status).toBe(401);
  });

  it('rejects a missing signature', async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it('rejects a signature that is not 64 hex characters', async () => {
    const body = JSON.stringify(samplePayload());
    const good = sign(body);
    for (const bad of ['', 'abc', good.slice(0, 62), good + '00', 'z'.repeat(64), `sha256=${good}`]) {
      const res = await POST(makeRequest({ 'creem-signature': bad }, body));
      expect(res.status).toBe(401);
    }
  });

  it('returns 400 for invalid JSON after verifying the signature', async () => {
    const res = await POST(makeRequest({ 'creem-signature': sign('not json') }, 'not json'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    const res = await POST(makeRequest({ 'creem-signature': sign('[1,2]') }, '[1,2]'));
    expect(res.status).toBe(400);
  });

  it.each([
    'checkout.completed',
    'subscription.active',
    'subscription.paid',
    'subscription.canceled',
    'subscription.scheduled_cancel',
    'subscription.past_due',
    'subscription.unpaid',
    'subscription.expired',
    'subscription.update',
    'subscription.trialing',
    'subscription.paused',
    'refund.created',
    'dispute.created',
    'credits.granted',
    'credits.consumed',
    'credits.auto_recharged',
    'customer_credits.exhausted',
    'something.else'
  ])('returns 200 for %s', async (eventType) => {
    const body = JSON.stringify(samplePayload(eventType));
    const res = await POST(makeRequest({ 'creem-signature': sign(body) }, body));
    expect(res.status).toBe(200);
  });
});

describe('verifyCreemSignature', () => {
  const body = Buffer.from(JSON.stringify(samplePayload()));

  it('accepts a matching signature', () => {
    expect(verifyCreemSignature(body, sign(body), SECRET)).toBe(true);
  });

  it('rejects when no secret is configured', () => {
    expect(verifyCreemSignature(body, sign(body), '')).toBe(false);
    // An undefined argument falls back to the env var, so unset it to test "not configured"
    delete process.env.CREEM_WEBHOOK_SECRET;
    try {
      expect(verifyCreemSignature(body, sign(body))).toBe(false);
    } finally {
      process.env.CREEM_WEBHOOK_SECRET = SECRET;
    }
  });

  it('rejects null, undefined and non-hex signatures without throwing', () => {
    expect(verifyCreemSignature(body, null, SECRET)).toBe(false);
    expect(verifyCreemSignature(body, undefined, SECRET)).toBe(false);
    expect(verifyCreemSignature(body, 'é'.repeat(64), SECRET)).toBe(false);
  });
});
