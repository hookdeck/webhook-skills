import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, PUT, PATCH, DELETE } from '../app/webhooks/tray-io/route';
import { verifyTrayRequest } from '../lib/verify-tray-io';

const HEADER = 'X-Tray-Secret';
const SECRET = 'Bearer test_tray_secret_0123456789';

const EVENTS = ['record.created', 'record.updated', 'record.deleted'];

beforeAll(() => {
  process.env.TRAY_IO_WEBHOOK_HEADER = HEADER;
  process.env.TRAY_IO_WEBHOOK_SECRET = SECRET;
});

function samplePayload(event = 'record.created') {
  return { event, data: { id: 'rec_123', name: 'Acme' } };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string | null = JSON.stringify(samplePayload()),
  method = 'POST',
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/tray-io', {
    method,
    headers: { 'content-type': contentType, ...headers },
    ...(body === null || method === 'GET' ? {} : { body }),
  });
}

describe('/webhooks/tray-io', () => {
  describe('credential header verification', () => {
    it('accepts the correct whole value', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ [HEADER.toLowerCase()]: SECRET }));
      expect(res.status).toBe(200);
    });

    it('does not strip a Bearer prefix', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET.replace('Bearer ', '') }));
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

    it('does not look in a different header', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(401);
    });

    it('rejects when no secret is configured', () => {
      expect(verifyTrayRequest(new Headers({ [HEADER]: SECRET }), HEADER, '')).toBe(false);
    });

    it('compares against the default Authorization header', () => {
      expect(verifyTrayRequest(new Headers({ authorization: 'abc' }), 'Authorization', 'abc')).toBe(true);
      expect(verifyTrayRequest(new Headers({ authorization: 'abd' }), 'Authorization', 'abc')).toBe(false);
    });
  });

  describe('methods', () => {
    it.each([
      ['POST', POST],
      ['PUT', PUT],
      ['PATCH', PATCH],
      ['DELETE', DELETE],
    ])('accepts %s with a body', async (method, handler) => {
      const res = await handler(makeRequest({ [HEADER]: SECRET }, undefined, method));
      expect(res.status).toBe(200);
    });

    it('accepts GET with an empty body', async () => {
      const res = await GET(makeRequest({ [HEADER]: SECRET }, null, 'GET'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('rejects an unauthenticated GET', async () => {
      const res = await GET(makeRequest({}, null, 'GET'));
      expect(res.status).toBe(401);
    });

    it('accepts a POST with an empty body', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, ''));
      expect(res.status).toBe(200);
    });
  });

  describe('events', () => {
    it.each(EVENTS)('handles %s', async (event) => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload(event))));
      expect(res.status).toBe(200);
    });

    it('accepts an unknown event', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify({ event: 'custom.thing' })));
      expect(res.status).toBe(200);
    });

    it('accepts any content type when the body is JSON', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload()), 'POST', 'text/plain'));
      expect(res.status).toBe(200);
    });
  });

  describe('body validation', () => {
    it('returns 400 for invalid JSON', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, 'not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a form-encoded body', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, 'a=1', 'POST', 'application/x-www-form-urlencoded'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a JSON array', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '[]'));
      expect(res.status).toBe(400);
    });

    it('authenticates before parsing: bad credential with bad JSON is 401', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'wrong' }, 'not json'));
      expect(res.status).toBe(401);
    });
  });
});
