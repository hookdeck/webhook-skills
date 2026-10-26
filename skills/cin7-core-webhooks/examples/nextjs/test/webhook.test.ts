import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/cin7-core/route';
import { verifyCin7CoreRequest } from '../lib/verify-cin7-core';

const HEADER = 'X-Cin7-Token';
const SECRET = 'Bearer test_cin7_token_0123456789';

const EVENTS = [
  'Sale/Created', 'Sale/OrderAuthorised', 'Sale/ShipmentAuthorised',
  'Purchase/OrderAuthorised', 'Product/Updated',
];

beforeAll(() => {
  process.env.CIN7_CORE_WEBHOOK_HEADER = HEADER;
  process.env.CIN7_CORE_WEBHOOK_SECRET = SECRET;
});

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify({ EventType: 'Sale/Created' }),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/cin7-core', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/cin7-core', () => {
  describe('credential verification', () => {
    it('accepts the exact whole value', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ [HEADER.toLowerCase()]: SECRET }));
      expect(res.status).toBe(200);
    });

    it('does not strip the Bearer prefix', async () => {
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

    it('ignores the credential in a different header', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(401);
    });

    it('defaults to the Authorization header', () => {
      delete process.env.CIN7_CORE_WEBHOOK_HEADER;
      try {
        const headers = new Headers({ authorization: 'Bearer t' });
        expect(verifyCin7CoreRequest(headers, undefined, 'Bearer t')).toBe(true);
      } finally {
        process.env.CIN7_CORE_WEBHOOK_HEADER = HEADER;
      }
    });

    it('rejects everything when the secret is unset', () => {
      const headers = new Headers({ [HEADER]: SECRET });
      expect(verifyCin7CoreRequest(headers, HEADER, '')).toBe(false);
    });
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify({ EventType: 'Sale/Created' }), 'text/plain'));
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
    it.each(EVENTS)('handles %s', async (EventType) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify({ EventType })));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify({ EventType: 'Something/New' })));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });
});
