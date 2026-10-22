import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, PUT, PATCH, DELETE } from '../app/webhooks/make/route';
import { verifyMakeRequest } from '../lib/verify-make';

const SECRET = 'Bearer test_make_shared_secret_0123456789';

beforeAll(() => {
  process.env.MAKE_WEBHOOK_SECRET = SECRET;
  process.env.MAKE_WEBHOOK_HEADER = 'Authorization';
});

// What a Make HTTP > Make a request module would send with application/json
function samplePayload(event = 'order.created') {
  return {
    event,
    id: 'bundle_1042',
    data: { order_id: 'ord_123', email: 'jane@example.com', scenario_name: 'Orders sync' },
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string | null = JSON.stringify(samplePayload()),
  method = 'POST'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/make', {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(body !== null ? { body } : {}),
  });
}

describe('/webhooks/make', () => {
  describe('API key header', () => {
    it('accepts the exact header value', async () => {
      const res = await POST(makeRequest({ authorization: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ AUTHORIZATION: SECRET }));
      expect(res.status).toBe(200);
    });

    it('compares the whole value: the bare secret without "Bearer " is rejected', async () => {
      const res = await POST(makeRequest({ authorization: SECRET.replace(/^Bearer /, '') }));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await POST(makeRequest({ authorization: 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await POST(makeRequest({ authorization: 'short' }));
      expect(res.status).toBe(401);
    });

    it('returns 401 when the header is missing', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });
  });

  describe('Methods and bodies', () => {
    it.each([
      ['POST', POST],
      ['PUT', PUT],
      ['PATCH', PATCH],
      ['DELETE', DELETE],
    ])('accepts %s with a JSON body', async (method, handler) => {
      const res = await handler(makeRequest({ authorization: SECRET }, undefined, method));
      expect(res.status).toBe(200);
    });

    it('accepts GET with no body', async () => {
      const res = await GET(makeRequest({ authorization: SECRET }, null, 'GET'));
      expect(res.status).toBe(200);
    });

    it('rejects an unauthenticated GET', async () => {
      const res = await GET(makeRequest({}, null, 'GET'));
      expect(res.status).toBe(401);
    });

    it('accepts a JSON body sent with a non-JSON content type', async () => {
      const res = await POST(makeRequest({ authorization: SECRET, 'content-type': 'text/plain' }));
      expect(res.status).toBe(200);
    });

    it('accepts an empty POST body', async () => {
      const res = await POST(makeRequest({ authorization: SECRET }, ''));
      expect(res.status).toBe(200);
    });
  });

  describe('Request handling', () => {
    it('returns 400 for an invalid JSON body', async () => {
      const res = await POST(makeRequest({ authorization: SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest({ authorization: SECRET }, '[1,2,3]'));
      expect(res.status).toBe(400);
    });

    it('does not parse the body before authenticating', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });

    it('handles every example event and unknown events', async () => {
      const events = ['order.created', 'lead.created', 'scenario.completed', 'scenario.failed', 'something.else'];
      for (const event of events) {
        const res = await POST(
          makeRequest({ authorization: SECRET }, JSON.stringify(samplePayload(event)))
        );
        expect(res.status).toBe(200);
      }
    });
  });

  describe('verifyMakeRequest', () => {
    it('rejects everything when no secret is configured', () => {
      expect(verifyMakeRequest(new Headers({ authorization: '' }), {})).toBe(false);
      expect(verifyMakeRequest(new Headers(), {})).toBe(false);
    });

    it('uses a custom header name', () => {
      const config = { MAKE_WEBHOOK_SECRET: 's3cret', MAKE_WEBHOOK_HEADER: 'X-Make-Key' };
      expect(verifyMakeRequest(new Headers({ 'x-make-key': 's3cret' }), config)).toBe(true);
      expect(verifyMakeRequest(new Headers({ authorization: 's3cret' }), config)).toBe(false);
    });

    it('defaults the header name to Authorization', () => {
      expect(
        verifyMakeRequest(new Headers({ authorization: 's3cret' }), { MAKE_WEBHOOK_SECRET: 's3cret' })
      ).toBe(true);
    });
  });
});
