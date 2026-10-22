import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, PUT, PATCH, DELETE, GET } from '../app/webhooks/youcanbookme/route';
import { verifyYoucanbookmeRequest } from '../lib/verify-youcanbookme';

const HEADER = 'X-Ycbm-Secret';
const SECRET = 'Bearer test_secret_0123456789';

const EVENTS = [
  'booking_made', 'booking_rescheduled', 'booking_cancelled', 'reminder', 'follow_up', 'no_show',
];

beforeAll(() => {
  process.env.YOUCANBOOKME_WEBHOOK_HEADER = HEADER;
  process.env.YOUCANBOOKME_WEBHOOK_SECRET = SECRET;
});

function samplePayload(event = 'booking_made') {
  return { event, email: 'jane@example.com', start: '2026-11-02 10:00' };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string | undefined = JSON.stringify(samplePayload()),
  method = 'POST'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/youcanbookme', {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: method === 'GET' ? undefined : body,
  });
}

describe('/webhooks/youcanbookme', () => {
  describe('secret header verification', () => {
    it('accepts the correct header and value', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ [HEADER.toLowerCase()]: SECRET }));
      expect(res.status).toBe(200);
    });

    it('compares the whole value, including a Bearer prefix', async () => {
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

    it('rejects the secret sent under a different header name', async () => {
      const res = await POST(makeRequest({ authorization: SECRET }));
      expect(res.status).toBe(401);
    });

    it('rejects everything when the secret is unset', () => {
      const headers = new Headers({ [HEADER]: SECRET });
      expect(verifyYoucanbookmeRequest(headers, '', HEADER)).toBe(false);
      expect(verifyYoucanbookmeRequest(headers, undefined, HEADER)).toBe(true);
      delete process.env.YOUCANBOOKME_WEBHOOK_SECRET;
      expect(verifyYoucanbookmeRequest(headers, undefined, HEADER)).toBe(false);
      process.env.YOUCANBOOKME_WEBHOOK_SECRET = SECRET;
    });

    it('defaults the header name to Authorization', () => {
      delete process.env.YOUCANBOOKME_WEBHOOK_HEADER;
      expect(verifyYoucanbookmeRequest(new Headers({ authorization: SECRET }))).toBe(true);
      expect(verifyYoucanbookmeRequest(new Headers({ authorization: 'nope' }))).toBe(false);
      process.env.YOUCANBOOKME_WEBHOOK_HEADER = HEADER;
    });
  });

  describe('methods', () => {
    it.each([
      ['POST', POST],
      ['PUT', PUT],
      ['PATCH', PATCH],
      ['DELETE', DELETE],
    ])('accepts %s with a body', async (method, fn) => {
      const res = await fn(makeRequest({ [HEADER]: SECRET }, undefined, method));
      expect(res.status).toBe(200);
    });

    it('accepts GET with an empty body', async () => {
      const res = await GET(makeRequest({ [HEADER]: SECRET }, undefined, 'GET'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts POST with an empty body', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, ''));
      expect(res.status).toBe(200);
    });

    it('rejects an unauthenticated GET', async () => {
      const res = await GET(makeRequest({}, undefined, 'GET'));
      expect(res.status).toBe(401);
    });
  });

  describe('body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await POST(
        makeRequest({ [HEADER]: SECRET, 'content-type': 'text/plain' }, JSON.stringify(samplePayload()))
      );
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

    it('returns 401, not 400, for invalid JSON without the header', async () => {
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
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload('something_new'))));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });
});
