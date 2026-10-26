import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/hitpay/route';
import { verifyHitpaySignature } from '../lib/verify-hitpay';

const SALT = 'test_hitpay_webhook_salt_0123456789';

beforeAll(() => {
  process.env.HITPAY_WEBHOOK_SALT = SALT;
});

// HitPay: hex HMAC-SHA256 of the raw body, keyed with the webhook's salt
function sign(body: string, salt = SALT): string {
  return crypto.createHmac('sha256', salt).update(body).digest('hex');
}

const sampleBody = { id: '9e9a3451-a3e5-4fc5-9dfc-bc75e67c8808', status: 'succeeded', currency: 'sgd', amount: 913.84, refunded_amount: 0 };

function makeRequest(opts: {
  body?: string;
  object?: string | null;
  type?: string | null;
  signature?: string | null;
  contentType?: string;
} = {}): NextRequest {
  const body = opts.body ?? JSON.stringify(sampleBody);
  const headers: Record<string, string> = { 'content-type': opts.contentType ?? 'application/json' };
  const object = opts.object === undefined ? 'charge' : opts.object;
  const type = opts.type === undefined ? 'created' : opts.type;
  if (object !== null) headers['hitpay-event-object'] = object;
  if (type !== null) headers['hitpay-event-type'] = type;
  const signature = opts.signature === undefined ? sign(body) : opts.signature;
  if (signature !== null) headers['hitpay-signature'] = signature;
  return new NextRequest('http://localhost:3000/webhooks/hitpay', { method: 'POST', headers, body });
}

describe('HitPay webhook route', () => {
  describe('signature verification', () => {
    it('accepts a valid signature', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts an uppercase hex signature', async () => {
      const body = JSON.stringify(sampleBody);
      const res = await POST(makeRequest({ body, signature: sign(body).toUpperCase() }));
      expect(res.status).toBe(200);
    });

    it('rejects a signature made with the wrong salt', async () => {
      const body = JSON.stringify(sampleBody);
      const res = await POST(makeRequest({ body, signature: sign(body, 'api_key_salt') }));
      expect(res.status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      const signature = sign(JSON.stringify(sampleBody));
      const res = await POST(makeRequest({ body: JSON.stringify({ ...sampleBody, amount: 1 }), signature }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing signature', async () => {
      const res = await POST(makeRequest({ signature: null }));
      expect(res.status).toBe(401);
    });

    it('rejects malformed signatures without throwing', async () => {
      for (const signature of ['', 'abc', 'zz'.repeat(32), sign('x') + 'ab']) {
        const res = await POST(makeRequest({ signature }));
        expect(res.status).toBe(401);
      }
    });

    it('verifies whatever the content type is', async () => {
      const res = await POST(makeRequest({ contentType: 'text/plain' }));
      expect(res.status).toBe(200);
    });

    it('rejects everything when the salt is not configured', () => {
      expect(verifyHitpaySignature('{}', sign('{}'), '')).toBe(false);
    });
  });

  describe('event dispatch', () => {
    const combos: [string, string][] = [
      ['charge', 'created'], ['charge', 'updated'], ['order', 'created'], ['order', 'updated'],
      ['invoice', 'created'], ['invoice', 'updated'], ['payout', 'created'],
      ['transfer', 'paid'], ['transfer', 'failed'], ['transfer', 'canceled'],
    ];
    it.each(combos)('handles %s.%s', async (object, type) => {
      const res = await POST(makeRequest({ object, type }));
      expect(res.status).toBe(200);
    });

    it('returns 200 for an unknown event', async () => {
      const res = await POST(makeRequest({ object: 'widget', type: 'created' }));
      expect(res.status).toBe(200);
    });

    it('returns 400 when the event headers are missing', async () => {
      const res = await POST(makeRequest({ object: null, type: null }));
      expect(res.status).toBe(400);
    });
  });

  describe('body validation', () => {
    it('returns 400 for a signed body that is not JSON', async () => {
      const res = await POST(makeRequest({ body: 'not json' }));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a signed JSON array', async () => {
      const res = await POST(makeRequest({ body: '[1]' }));
      expect(res.status).toBe(400);
    });
  });
});
