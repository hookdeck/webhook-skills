import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, PUT, PATCH, DELETE } from '../app/webhooks/hightouch/route';
import { verifyHightouchRequest } from '../lib/verify-hightouch';

const SECRET = 'Bearer test_hightouch_secret_0123456789';

beforeAll(() => {
  process.env.HIGHTOUCH_WEBHOOK_SECRET = SECRET;
  delete process.env.HIGHTOUCH_WEBHOOK_HEADER; // default: Authorization
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.HIGHTOUCH_WEBHOOK_HEADER;
  process.env.HIGHTOUCH_WEBHOOK_SECRET = SECRET;
});

const row = { id: 'cus_123', email: 'alice@example.com', first_name: 'Alice' };

function makeRequest(
  method = 'POST',
  headers: Record<string, string> = {},
  body: string | null = JSON.stringify(row),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/hightouch', {
    method,
    headers: body === null ? headers : { 'content-type': contentType, ...headers },
    body: body === null ? undefined : body,
  });
}

const auth = { Authorization: SECRET };

describe('/webhooks/hightouch', () => {
  describe('credential header verification', () => {
    it('accepts the exact header value (Authorization by default)', async () => {
      const res = await POST(makeRequest('POST', auth));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true, trigger: 'row_added' });
    });

    it('looks the header name up case-insensitively', async () => {
      const res = await POST(makeRequest('POST', { authorization: SECRET }));
      expect(res.status).toBe(200);
    });

    it('compares the WHOLE value: the part after "Bearer " alone is rejected', async () => {
      const res = await POST(makeRequest('POST', { Authorization: SECRET.replace('Bearer ', '') }));
      expect(res.status).toBe(401);
    });

    it('does not strip or normalise a Bearer prefix', async () => {
      const res = await POST(makeRequest('POST', { Authorization: SECRET.replace('Bearer', 'bearer') }));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await POST(makeRequest('POST', { Authorization: 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await POST(makeRequest('POST', { Authorization: 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('authenticates before parsing the body (invalid JSON + no credential = 401)', async () => {
      const res = await POST(makeRequest('POST', {}, '{not json'));
      expect(res.status).toBe(401);
    });

    it('rejects everything when the secret is not configured', async () => {
      delete process.env.HIGHTOUCH_WEBHOOK_SECRET;
      const res = await POST(makeRequest('POST', { Authorization: 'anything' }));
      expect(res.status).toBe(401);
    });

    it('reads a custom header name from HIGHTOUCH_WEBHOOK_HEADER', async () => {
      process.env.HIGHTOUCH_WEBHOOK_HEADER = 'X-Hightouch-Key';
      const ok = await POST(makeRequest('POST', { 'x-hightouch-key': SECRET }));
      expect(ok.status).toBe(200);
      // The default header no longer counts.
      const bad = await POST(makeRequest('POST', auth));
      expect(bad.status).toBe(401);
    });
  });

  describe('request methods', () => {
    it.each([
      ['POST', POST, 'row_added'],
      ['PUT', PUT, 'row_changed'],
      ['PATCH', PATCH, 'row_changed'],
      ['DELETE', DELETE, 'row_removed'],
    ])('accepts %s and maps it to %s', async (method, handler, trigger) => {
      const res = await handler(makeRequest(method, auth));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true, trigger });
    });

    it('accepts a GET with no body', async () => {
      const res = await GET(makeRequest('GET', auth, null));
      expect(res.status).toBe(200);
      expect((await res.json()).trigger).toBe('unmapped');
    });

    it('still requires the credential on GET', async () => {
      const res = await GET(makeRequest('GET', {}, null));
      expect(res.status).toBe(401);
    });
  });

  describe('request bodies', () => {
    it('accepts an empty body on POST', async () => {
      const res = await POST(makeRequest('POST', auth, ''));
      expect(res.status).toBe(200);
    });

    it('accepts a batched array body', async () => {
      const res = await POST(makeRequest('POST', auth, JSON.stringify([row, { ...row, id: 'cus_456' }])));
      expect(res.status).toBe(200);
    });

    it('accepts a batch wrapped in an object', async () => {
      const res = await POST(makeRequest('POST', auth, JSON.stringify({ users: [row] })));
      expect(res.status).toBe(200);
    });

    it('accepts any content type (JSON sent as text/plain)', async () => {
      const res = await POST(makeRequest('POST', auth, JSON.stringify(row), 'text/plain'));
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest('POST', auth, '{not json'));
      expect(res.status).toBe(400);
    });
  });

  describe('verifyHightouchRequest', () => {
    it('works with explicit secret and header name', () => {
      expect(verifyHightouchRequest(new Headers({ 'x-key': 'abc' }), 'abc', 'X-Key')).toBe(true);
      expect(verifyHightouchRequest(new Headers({ 'x-key': 'abd' }), 'abc', 'X-Key')).toBe(false);
      expect(verifyHightouchRequest(new Headers(), 'abc', 'X-Key')).toBe(false);
      expect(verifyHightouchRequest(new Headers({ 'x-key': 'abc' }), '', 'X-Key')).toBe(false);
    });
  });
});
