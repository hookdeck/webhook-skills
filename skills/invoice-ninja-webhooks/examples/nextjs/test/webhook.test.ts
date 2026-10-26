import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import * as route from '../app/webhooks/invoice-ninja/route';
import { POST, PUT } from '../app/webhooks/invoice-ninja/route';
import { detectEntity, verifyInvoiceNinjaRequest } from '../lib/verify-invoice-ninja';

const HEADER = 'X-Webhook-Secret';
const SECRET = 'test_invoice_ninja_secret_0123456789';

beforeAll(() => {
  process.env.INVOICE_NINJA_WEBHOOK_HEADER = HEADER;
  process.env.INVOICE_NINJA_WEBHOOK_SECRET = SECRET;
});

const INVOICE = { id: 'Opnel5aKBz', number: '0001', client_id: 'Wpmbk5ezJn', amount: 100, line_items: [{ product_key: 'x', cost: 100, quantity: 1 }] };
const PAYMENT = { id: 'AS3df3A', number: '0002', client_id: 'Wpmbk5ezJn', amount: 100, applied: 100, transaction_reference: 'abc' };
const CLIENT = { id: 'Wpmbk5ezJn', name: 'Acme', contacts: [{ id: 'c1', email: 'a@example.com' }] };

function makeRequest(
  method: string,
  {
    headers = { [HEADER]: SECRET } as Record<string, string>,
    body = JSON.stringify(INVOICE) as string | null,
    query = '',
    contentType = 'application/json',
  } = {}
): NextRequest {
  return new NextRequest(`http://localhost:3000/webhooks/invoice-ninja${query}`, {
    method,
    headers: { ...(body !== null ? { 'content-type': contentType } : {}), ...headers },
    body: body ?? undefined,
  });
}

describe('/webhooks/invoice-ninja', () => {
  describe('secret header verification', () => {
    it('accepts the correct header value', async () => {
      const res = await POST(makeRequest('POST'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest('POST', { headers: { 'x-webhook-secret': SECRET } }));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await POST(makeRequest('POST', { headers: { [HEADER]: 'x'.repeat(SECRET.length) } }));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await POST(makeRequest('POST', { headers: { [HEADER]: 'short' } }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest('POST', { headers: {} }));
      expect(res.status).toBe(401);
    });

    it('never answers 404, 405 or 410 for bad credentials', async () => {
      for (const [method, fn] of [['POST', POST], ['PUT', PUT]] as const) {
        const res = await fn(makeRequest(method, { headers: {} }));
        expect([404, 405, 410]).not.toContain(res.status);
        expect(res.status).toBe(401);
      }
    });
  });

  describe('request methods', () => {
    it('accepts PUT with a JSON body', async () => {
      expect((await PUT(makeRequest('PUT'))).status).toBe(200);
    });

    it('exports only POST and PUT (rest_method is only post or put)', () => {
      const methods = Object.keys(route).filter((k) => /^[A-Z]+$/.test(k));
      expect(methods.sort()).toEqual(['POST', 'PUT']);
    });

    it('accepts an empty POST body', async () => {
      const res = await POST(makeRequest('POST', { body: '' }));
      expect(res.status).toBe(200);
    });
  });

  describe('body handling', () => {
    it('accepts a JSON body with any content type', async () => {
      const res = await POST(makeRequest('POST', { contentType: 'text/plain' }));
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await POST(makeRequest('POST', { body: 'not json' }));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a JSON array', async () => {
      const res = await POST(makeRequest('POST', { body: '[1,2]' }));
      expect(res.status).toBe(400);
    });

    it('does not parse the body when the credential is wrong', async () => {
      const res = await POST(makeRequest('POST', { headers: {}, body: 'not json' }));
      expect(res.status).toBe(401);
    });
  });

  describe('routing', () => {
    it.each([
      ['create_invoice', INVOICE, 'Invoice created'],
      ['create_payment', PAYMENT, 'Payment created'],
      ['update_client', CLIENT, 'Client updated'],
    ])('routes ?event=%s by URL', async (event, body, expected) => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest('POST', { body: JSON.stringify(body), query: `?event=${event}` }));
      expect(res.status).toBe(200);
      expect(log).toHaveBeenCalledWith(expect.stringContaining(expected));
      log.mockRestore();
    });

    it('falls back to entity shape when there is no event in the URL', async () => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      await POST(makeRequest('POST', { body: JSON.stringify(PAYMENT) }));
      expect(log).toHaveBeenCalledWith(expect.stringContaining('Payment received'));
      log.mockRestore();
    });

    it('detects entity shapes', () => {
      expect(detectEntity(INVOICE)).toBe('document');
      expect(detectEntity(PAYMENT)).toBe('payment');
      expect(detectEntity(CLIENT)).toBe('client');
      expect(detectEntity({})).toBe('unknown');
    });
  });

  describe('verifyInvoiceNinjaRequest', () => {
    it('compares the whole value including a Bearer prefix', () => {
      const bearer = new Headers({ authorization: 'Bearer abc123' });
      expect(verifyInvoiceNinjaRequest(bearer, 'Bearer abc123', 'Authorization')).toBe(true);
      expect(verifyInvoiceNinjaRequest(new Headers({ authorization: 'abc123' }), 'Bearer abc123', 'Authorization')).toBe(false);
      expect(verifyInvoiceNinjaRequest(bearer, 'abc123', 'Authorization')).toBe(false);
    });

    it('rejects everything when no secret is configured', () => {
      expect(verifyInvoiceNinjaRequest(new Headers({ authorization: 'x' }), '', 'Authorization')).toBe(false);
    });
  });
});
