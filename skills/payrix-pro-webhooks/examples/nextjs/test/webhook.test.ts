// Generated with: payrix-pro-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';

const HEADER = 'X-Payrix-Secret';
const SECRET = 'Bearer test_payrix_pro_secret_0123456789';

let route: typeof import('../app/webhooks/payrix-pro/route');
let lib: typeof import('../lib/verify-payrix-pro');

beforeAll(async () => {
  process.env.PAYRIX_PRO_WEBHOOK_HEADER = HEADER;
  process.env.PAYRIX_PRO_WEBHOOK_SECRET = SECRET;
  route = await import('../app/webhooks/payrix-pro/route');
  lib = await import('../lib/verify-payrix-pro');
});

// Illustrative payloads: Payrix doesn't document the body shape.
const transactionAlert = { alert: 'transaction', transaction: { id: 't1_txn_example', total: 1500 } };
const merchantAlert = { alert: 'merchant', merchant: { id: 't1_mer_example', status: 1 } };

function makeRequest(
  method: string,
  headers: Record<string, string> = {},
  body?: string,
  contentType: string | null = 'application/json'
) {
  const h: Record<string, string> = { ...headers };
  if (contentType && body !== undefined) h['content-type'] = contentType;
  return new NextRequest('http://localhost:3000/webhooks/payrix-pro', {
    method,
    headers: h,
    body: method === 'GET' ? undefined : body,
  });
}

const json = (o: unknown) => JSON.stringify(o);

describe('Payrix Pro webhook', () => {
  describe('credential check', () => {
    it('accepts the exact header value', async () => {
      const res = await route.POST(makeRequest('POST', { [HEADER]: SECRET }, json(transactionAlert)));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await route.POST(makeRequest('POST', { 'x-payrix-secret': SECRET }, json(merchantAlert)));
      expect(res.status).toBe(200);
    });

    it('compares the whole value: a stripped Bearer prefix is rejected', async () => {
      const res = await route.POST(makeRequest('POST', { [HEADER]: SECRET.replace('Bearer ', '') }, json(transactionAlert)));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await route.POST(makeRequest('POST', { [HEADER]: 'x'.repeat(SECRET.length) }, json(transactionAlert)));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await route.POST(makeRequest('POST', { [HEADER]: 'short' }, json(transactionAlert)));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await route.POST(makeRequest('POST', {}, json(transactionAlert)));
      expect(res.status).toBe(401);
    });

    it('fails closed when no secret is configured', () => {
      expect(lib.verifyPayrixProRequest(new Headers({ [HEADER]: 'anything' }), '', HEADER)).toBe(false);
    });

    it('defaults the header name to Authorization', () => {
      const saved = process.env.PAYRIX_PRO_WEBHOOK_HEADER;
      delete process.env.PAYRIX_PRO_WEBHOOK_HEADER;
      try {
        expect(lib.verifyPayrixProRequest(new Headers({ authorization: SECRET }))).toBe(true);
      } finally {
        process.env.PAYRIX_PRO_WEBHOOK_HEADER = saved;
      }
    });
  });

  describe('methods', () => {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      it(`${method} with the credential and an empty body is accepted`, async () => {
        const res = await route[method](makeRequest(method, { [HEADER]: SECRET }));
        expect(res.status).toBe(200);
      });

      it(`${method} checks the credential first`, async () => {
        const res = await route[method](makeRequest(method, { [HEADER]: 'nope' }));
        expect(res.status).toBe(401);
      });
    }
  });

  describe('body handling', () => {
    it('accepts form-encoded and plain text bodies', async () => {
      const form = await route.POST(makeRequest('POST', { [HEADER]: SECRET }, 'alert=transaction&id=t1', 'application/x-www-form-urlencoded'));
      expect(form.status).toBe(200);
      const text = await route.POST(makeRequest('POST', { [HEADER]: SECRET }, 'hello', 'text/plain'));
      expect(text.status).toBe(200);
    });

    it('returns 400 for malformed JSON declared as JSON', async () => {
      const res = await route.POST(makeRequest('POST', { [HEADER]: SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('authenticates before parsing: malformed JSON without the credential is 401', async () => {
      const res = await route.POST(makeRequest('POST', {}, '{not json'));
      expect(res.status).toBe(401);
    });

    it('parseBody keeps raw text for non-JSON content types', () => {
      expect(lib.parseBody('a=1', 'application/x-www-form-urlencoded')).toEqual({ payload: 'a=1' });
      expect(lib.parseBody('', 'application/json')).toEqual({ payload: null });
      expect(lib.parseBody('{"a":1}', 'application/vnd.api+json')).toEqual({ payload: { a: 1 } });
    });
  });
});
