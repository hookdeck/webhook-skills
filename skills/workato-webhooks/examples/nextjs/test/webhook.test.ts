import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, PUT, PATCH, GET, DELETE } from '../app/webhooks/workato/route';
import { verifyWorkatoRequest } from '../lib/verify-workato';

const USER = 'workato';
const PASSWORD = 'test_workato_password:with-colon';

beforeAll(() => {
  process.env.WORKATO_WEBHOOK_USERNAME = USER;
  process.env.WORKATO_WEBHOOK_PASSWORD = PASSWORD;
});

function basic(user: string, password: string): string {
  return 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64');
}

const GOOD = basic(USER, PASSWORD);

// What a Workato HTTP action would send (the body is whatever the recipe builds)
function samplePayload(event = 'order.created') {
  return {
    event,
    data: { order_id: 'ord_123', record_id: 'rec_9', recipe_name: 'Orders sync', error: 'timeout' },
  };
}

function makeRequest(
  method: string,
  auth: string | null = GOOD,
  body: string | null = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  const headers: Record<string, string> = {};
  if (auth) headers.authorization = auth;
  if (body !== null) headers['content-type'] = contentType;
  return new NextRequest('http://localhost:3000/webhooks/workato', { method, headers, body: body ?? undefined });
}

describe('/webhooks/workato', () => {
  describe('Basic auth', () => {
    it('accepts the configured username and password (password contains a colon)', async () => {
      const res = await POST(makeRequest('POST'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('treats the scheme case-insensitively', async () => {
      expect((await POST(makeRequest('POST', 'basic ' + GOOD.slice(6)))).status).toBe(200);
    });

    it('rejects a wrong password of the same length', async () => {
      const res = await POST(makeRequest('POST', basic(USER, 'x'.repeat(PASSWORD.length))));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong password of a different length without throwing', async () => {
      expect((await POST(makeRequest('POST', basic(USER, 'short')))).status).toBe(401);
    });

    it('rejects a wrong username', async () => {
      expect((await POST(makeRequest('POST', basic('admin', PASSWORD)))).status).toBe(401);
    });

    it('returns 401 when the Authorization header is missing', async () => {
      expect((await POST(makeRequest('POST', null))).status).toBe(401);
    });

    it('returns 401 for a non-Basic scheme', async () => {
      expect((await POST(makeRequest('POST', 'Bearer ' + PASSWORD))).status).toBe(401);
    });

    it('returns 401 for a malformed header (no colon after decoding)', async () => {
      const auth = 'Basic ' + Buffer.from('nocolon').toString('base64');
      expect((await POST(makeRequest('POST', auth))).status).toBe(401);
    });
  });

  describe('HTTP methods', () => {
    it.each([
      ['POST', POST],
      ['PUT', PUT],
      ['PATCH', PATCH],
      ['DELETE', DELETE],
    ])('accepts %s with a JSON body', async (method, handler) => {
      expect((await handler(makeRequest(method))).status).toBe(200);
    });

    it.each([
      ['GET', GET],
      ['DELETE', DELETE],
    ])('accepts %s with no body', async (method, handler) => {
      const res = await handler(makeRequest(method, GOOD, null));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('still authenticates a GET', async () => {
      expect((await GET(makeRequest('GET', null, null))).status).toBe(401);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type', async () => {
      const res = await POST(makeRequest('POST', GOOD, JSON.stringify(samplePayload()), 'text/plain'));
      expect(res.status).toBe(200);
    });

    it('returns 400 for an invalid JSON body', async () => {
      expect((await POST(makeRequest('POST', GOOD, '{not json'))).status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      expect((await POST(makeRequest('POST', GOOD, '[1,2,3]'))).status).toBe(400);
    });

    it('returns 401, not 400, for a bad body without credentials', async () => {
      expect((await POST(makeRequest('POST', null, '{not json'))).status).toBe(401);
    });

    it('handles every example event and unknown events', async () => {
      for (const event of ['order.created', 'record.updated', 'recipe.failed', 'something.else']) {
        const res = await POST(makeRequest('POST', GOOD, JSON.stringify(samplePayload(event))));
        expect(res.status).toBe(200);
      }
    });
  });
});

describe('verifyWorkatoRequest', () => {
  it('rejects everything when credentials are not configured', () => {
    expect(verifyWorkatoRequest(new Headers({ authorization: basic('', '') }), {})).toBe(false);
    expect(
      verifyWorkatoRequest(new Headers({ authorization: GOOD }), { WORKATO_WEBHOOK_USERNAME: USER })
    ).toBe(false);
  });
});
