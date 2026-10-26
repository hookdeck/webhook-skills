import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, PUT, PATCH, DELETE } from '../app/webhooks/torii/route';
import { verifyToriiRequest } from '../lib/verify-torii';

const SECRET = 'Bearer test_torii_secret_0123456789';

// Illustrative bodies: Torii defines no event field; these are made-up workflow templates.
const BODIES = [
  { workflow: 'new app discovered', app: { name: 'Example App' } },
  { workflow: 'user offboarding', user: { email: 'jane@example.com' } },
];

beforeAll(() => {
  process.env.TORII_WEBHOOK_HEADER = 'Authorization';
  process.env.TORII_WEBHOOK_SECRET = SECRET;
});

function makeRequest(
  method: string,
  headers: Record<string, string> = {},
  body?: string,
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/torii', {
    method,
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('/webhooks/torii', () => {
  describe('credential header verification', () => {
    it('accepts the exact whole header value', async () => {
      const res = await POST(makeRequest('POST', { Authorization: SECRET }, JSON.stringify(BODIES[0])));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest('POST', { authorization: SECRET }, '{}'));
      expect(res.status).toBe(200);
    });

    it('rejects a missing header with 401', async () => {
      expect((await POST(makeRequest('POST', {}, '{}'))).status).toBe(401);
    });

    it('rejects a wrong value with 401', async () => {
      expect((await POST(makeRequest('POST', { Authorization: 'Bearer nope' }, '{}'))).status).toBe(401);
    });

    it('does not strip a Bearer prefix (whole-value compare)', async () => {
      const res = await POST(makeRequest('POST', { Authorization: 'test_torii_secret_0123456789' }, '{}'));
      expect(res.status).toBe(401);
    });

    it('rejects a different-length value without throwing', async () => {
      expect((await POST(makeRequest('POST', { Authorization: 'x' }, '{}'))).status).toBe(401);
    });

    it('rejects when the secret is not configured', () => {
      const h = new Headers({ authorization: 'anything' });
      expect(verifyToriiRequest(h, '')).toBe(false);
    });

    it('honours a custom header name', () => {
      expect(verifyToriiRequest(new Headers({ 'x-torii-key': 'abc' }), 'abc', 'X-Torii-Key')).toBe(true);
      expect(verifyToriiRequest(new Headers({ authorization: 'abc' }), 'abc', 'X-Torii-Key')).toBe(false);
    });
  });

  describe('methods and bodies', () => {
    it.each([
      ['PUT', PUT],
      ['PATCH', PATCH],
      ['DELETE', DELETE],
    ])('accepts %s', async (method, fn) => {
      const res = await fn(makeRequest(method, { Authorization: SECRET }, JSON.stringify(BODIES[1])));
      expect(res.status).toBe(200);
    });

    it('accepts GET with an empty body', async () => {
      expect((await GET(makeRequest('GET', { Authorization: SECRET }))).status).toBe(200);
    });

    it('accepts POST with an empty body', async () => {
      expect((await POST(makeRequest('POST', { Authorization: SECRET }, ''))).status).toBe(200);
    });

    it('rejects unauthenticated GET with 401', async () => {
      expect((await GET(makeRequest('GET'))).status).toBe(401);
    });

    it.each(BODIES.map((b) => [b.workflow, b] as const))('handles "%s"', async (_name, body) => {
      const res = await POST(makeRequest('POST', { Authorization: SECRET }, JSON.stringify(body)));
      expect(res.status).toBe(200);
    });

    it('accepts any content type', async () => {
      const res = await POST(
        makeRequest('POST', { Authorization: SECRET }, JSON.stringify(BODIES[0]), 'text/plain')
      );
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authentication', async () => {
      expect((await POST(makeRequest('POST', { Authorization: SECRET }, '{not json'))).status).toBe(400);
    });

    it('authenticates before parsing (bad JSON, no credential -> 401)', async () => {
      expect((await POST(makeRequest('POST', {}, '{not json'))).status).toBe(401);
    });
  });
});
