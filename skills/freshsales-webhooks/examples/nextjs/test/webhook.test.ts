import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, PUT, PATCH, GET, DELETE } from '../app/webhooks/freshsales/route';
import { verifyFreshsalesRequest } from '../lib/verify-freshsales';

const SECRET = 'a3f9c0e17b2d4c58b6e1f0a9d8c7b6a5';
const HEADER = 'X-Webhook-Secret';

beforeAll(() => {
  process.env.FRESHSALES_WEBHOOK_SECRET = SECRET;
  delete process.env.FRESHSALES_WEBHOOK_HEADER; // exercise the X-Webhook-Secret default
});

// Illustrative Advanced content: Freshsales sends whatever the workflow author writes.
const DEAL = { deal: { id: '12345', name: 'Acme renewal', amount: '5000', stage: 'Won' } };
const CONTACT = { contact: { id: '678', first_name: 'Ada', email: 'ada@example.com' } };

function makeRequest(
  method: string,
  headers: Record<string, string> = {},
  body?: string,
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/freshsales', {
    method,
    headers: body === undefined ? headers : { 'content-type': contentType, ...headers },
    body,
  });
}

describe('/webhooks/freshsales', () => {
  describe('Secret header verification', () => {
    it('accepts the correct secret', async () => {
      const res = await POST(makeRequest('POST', { [HEADER]: SECRET }, JSON.stringify(DEAL)));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest('POST', { 'x-WEBHOOK-secret': SECRET }, JSON.stringify(DEAL)));
      expect(res.status).toBe(200);
    });

    it('compares the whole value, including a Bearer prefix', () => {
      const withPrefix = new Headers({ 'x-webhook-secret': `Bearer ${SECRET}` });
      expect(verifyFreshsalesRequest(withPrefix, `Bearer ${SECRET}`)).toBe(true);
      expect(verifyFreshsalesRequest(withPrefix, SECRET)).toBe(false);
      expect(verifyFreshsalesRequest(new Headers({ 'x-webhook-secret': SECRET }), `Bearer ${SECRET}`)).toBe(false);
    });

    it('rejects a wrong secret of the same length', async () => {
      const res = await POST(makeRequest('POST', { [HEADER]: 'x'.repeat(SECRET.length) }, JSON.stringify(DEAL)));
      expect(res.status).toBe(401);
    });

    it('rejects a secret of a different length without throwing', async () => {
      const res = await POST(makeRequest('POST', { [HEADER]: 'short' }, JSON.stringify(DEAL)));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest('POST', {}, JSON.stringify(DEAL)));
      expect(res.status).toBe(401);
    });

    it('rejects a secret sent in a different header', async () => {
      const res = await POST(makeRequest('POST', { Authorization: SECRET }, JSON.stringify(DEAL)));
      expect(res.status).toBe(401);
    });

    it('rejects everything when FRESHSALES_WEBHOOK_SECRET is unset', () => {
      const headers = new Headers({ [HEADER]: SECRET });
      expect(verifyFreshsalesRequest(headers, '')).toBe(false);
      delete process.env.FRESHSALES_WEBHOOK_SECRET;
      expect(verifyFreshsalesRequest(headers)).toBe(false);
      process.env.FRESHSALES_WEBHOOK_SECRET = SECRET;
    });

    it('honours a custom header name', () => {
      expect(verifyFreshsalesRequest(new Headers({ 'x-fs-key': SECRET }), SECRET, 'X-FS-Key')).toBe(true);
      expect(verifyFreshsalesRequest(new Headers({ [HEADER]: SECRET }), SECRET, 'X-FS-Key')).toBe(false);
    });
  });

  describe('Request methods', () => {
    it.each([['POST', POST], ['PUT', PUT], ['PATCH', PATCH]] as const)('accepts %s with a body', async (method, fn) => {
      const res = await fn(makeRequest(method, { [HEADER]: SECRET }, JSON.stringify(DEAL)));
      expect(res.status).toBe(200);
    });

    it.each([['GET', GET], ['DELETE', DELETE]] as const)('accepts %s with no body', async (method, fn) => {
      const res = await fn(makeRequest(method, { [HEADER]: SECRET }));
      expect(res.status).toBe(200);
    });

    it.each([['GET', GET], ['DELETE', DELETE]] as const)('rejects %s without the secret', async (method, fn) => {
      const res = await fn(makeRequest(method));
      expect(res.status).toBe(401);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type', async () => {
      const res = await POST(makeRequest('POST', { [HEADER]: SECRET }, JSON.stringify(DEAL), 'text/plain'));
      expect(res.status).toBe(200);
    });

    it('accepts an empty POST body', async () => {
      const res = await POST(makeRequest('POST', { [HEADER]: SECRET }, ''));
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest('POST', { [HEADER]: SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the secret', async () => {
      const res = await POST(makeRequest('POST', {}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('Payload handling', () => {
    it('handles an illustrative deal body', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await POST(makeRequest('POST', { [HEADER]: SECRET }, JSON.stringify(DEAL)));
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Deal webhook'))).toBe(true);
      spy.mockRestore();
    });

    it('handles an illustrative contact body', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await POST(makeRequest('POST', { [HEADER]: SECRET }, JSON.stringify(CONTACT)));
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Contact webhook'))).toBe(true);
      spy.mockRestore();
    });

    it('acknowledges bodies of any other shape', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest('POST', { [HEADER]: SECRET }, JSON.stringify({ anything: 'else' })));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });
});
