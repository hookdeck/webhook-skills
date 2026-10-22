import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, PUT, PATCH } from '../app/webhooks/ory/route';
import { verifyOryRequest } from '../lib/verify-ory';

const HEADER = 'X-Ory-Webhook-Key';
const SECRET = 'Bearer test_ory_secret_0123456789';

const EVENTS = [
  'registration.after', 'login.after', 'settings.after', 'verification.after', 'recovery.after',
];

beforeAll(() => {
  process.env.ORY_WEBHOOK_HEADER = HEADER;
  process.env.ORY_WEBHOOK_SECRET = SECRET;
});

// Mirrors the illustrative Jsonnet template: function(ctx) { event: 'registration.after', identity: ctx.identity }
function samplePayload(event = 'registration.after') {
  return {
    event,
    identity: { id: '3a5293f1-f4d6-49f4-b34f-6da62c360604', traits: { email: 'user@example.com' } },
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string | null = JSON.stringify(samplePayload()),
  method = 'POST'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/ory', {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(body === null ? {} : { body }),
  });
}

describe('/webhooks/ory', () => {
  describe('credential verification', () => {
    it('accepts the exact header value', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ [HEADER.toLowerCase()]: SECRET }));
      expect(res.status).toBe(200);
    });

    it('compares the whole value: "Bearer " is not stripped', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'test_ory_secret_0123456789' }));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('ignores the secret in a different header', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(401);
    });

    it('rejects everything when no secret is configured', () => {
      const headers = new Headers({ [HEADER]: SECRET });
      expect(verifyOryRequest(headers, '', HEADER)).toBe(false);
      expect(verifyOryRequest(headers, SECRET, HEADER)).toBe(true);
    });

    it('defaults the header name to Authorization', () => {
      delete process.env.ORY_WEBHOOK_HEADER;
      expect(verifyOryRequest(new Headers({ Authorization: SECRET }))).toBe(true);
      process.env.ORY_WEBHOOK_HEADER = HEADER;
    });
  });

  describe('methods', () => {
    it.each([['POST', POST], ['PUT', PUT], ['PATCH', PATCH]] as const)(
      'accepts %s with a body',
      async (method, fn) => {
        const res = await fn(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload()), method));
        expect(res.status).toBe(200);
      }
    );

    it('accepts GET with no body', async () => {
      const res = await GET(makeRequest({ [HEADER]: SECRET }, null, 'GET'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('requires the credential on GET too', async () => {
      const res = await GET(makeRequest({}, null, 'GET'));
      expect(res.status).toBe(401);
    });
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const req = new NextRequest('http://localhost:3000/webhooks/ory', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', [HEADER]: SECRET },
        body: JSON.stringify(samplePayload()),
      });
      expect((await POST(req)).status).toBe(200);
    });

    it('accepts an empty body', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, ''));
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the credential', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('event handling', () => {
    it.each(EVENTS)('handles %s', async (event) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload(event))));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload('something.new'))));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });
});
