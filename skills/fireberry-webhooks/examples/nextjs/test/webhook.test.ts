import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, PUT, PATCH, GET, DELETE } from '../app/webhooks/fireberry/route';
import { verifyFireberryRequest } from '../lib/verify-fireberry';

// The secret is the whole header value, including the "Bearer " prefix the user typed.
const SECRET = 'Bearer test_fireberry_secret_0123456789';

beforeAll(() => {
  process.env.FIREBERRY_WEBHOOK_SECRET = SECRET;
  delete process.env.FIREBERRY_WEBHOOK_HEADER; // default: Authorization
});

// Illustrative body: Fireberry adds no event field, the automation's author writes the body.
function samplePayload(event = 'account.created') {
  return { event, record: { id: 'a1b2c3', accountname: 'Acme Ltd', statuscode: 'Lead' } };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string | null = JSON.stringify(samplePayload()),
  method = 'POST'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/fireberry', {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(body === null ? {} : { body }),
  });
}

describe('/webhooks/fireberry', () => {
  describe('secret header verification', () => {
    it('accepts the exact header value (default header Authorization)', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ authorization: SECRET }));
      expect(res.status).toBe(200);
    });

    it('compares the whole value: the bare secret without "Bearer " is rejected', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET.replace('Bearer ', '') }));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await POST(makeRequest({ Authorization: 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await POST(makeRequest({ Authorization: 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects everything when no secret is configured', () => {
      const headers = new Headers({ authorization: SECRET });
      expect(verifyFireberryRequest(headers, '')).toBe(false);
      expect(verifyFireberryRequest(headers, SECRET, 'Authorization')).toBe(true);
    });

    describe('custom header name', () => {
      beforeAll(() => { process.env.FIREBERRY_WEBHOOK_HEADER = 'X-Fireberry-Secret'; });
      afterAll(() => { delete process.env.FIREBERRY_WEBHOOK_HEADER; });

      it('reads the header named in FIREBERRY_WEBHOOK_HEADER', async () => {
        const res = await POST(makeRequest({ 'x-fireberry-secret': SECRET }));
        expect(res.status).toBe(200);
      });

      it('no longer accepts the default Authorization header', async () => {
        const res = await POST(makeRequest({ Authorization: SECRET }));
        expect(res.status).toBe(401);
      });
    });
  });

  describe('request methods', () => {
    it.each([
      ['POST', POST],
      ['PUT', PUT],
      ['PATCH', PATCH],
      ['DELETE', DELETE],
    ])('accepts %s with a JSON body', async (method, handler) => {
      const res = await handler(makeRequest({ Authorization: SECRET }, undefined, method));
      expect(res.status).toBe(200);
    });

    it.each([
      ['GET', GET],
      ['DELETE', DELETE],
    ])('accepts %s with an empty body', async (method, handler) => {
      const res = await handler(makeRequest({ Authorization: SECRET }, null, method));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('still requires the secret on GET', async () => {
      const res = await GET(makeRequest({}, null, 'GET'));
      expect(res.status).toBe(401);
    });
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const res = await POST(
        makeRequest({ 'content-type': 'text/plain', Authorization: SECRET })
      );
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the secret', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('event handling (illustrative body)', () => {
    it.each(['account.created', 'record.updated'])('handles %s', async (event) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ Authorization: SECRET }, JSON.stringify(samplePayload(event)))
      );
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ Authorization: SECRET }, JSON.stringify(samplePayload('something.else')))
      );
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });
});
