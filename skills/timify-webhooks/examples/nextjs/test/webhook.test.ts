import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/timify/route';
import { verifyTimifyRequest } from '../lib/verify-timify';

const SECRET = 'Bearer test_timify_secret_0123456789';

// Webhook names and types from TIMIFY's scope table (Sync webhooks are not supported).
const WEBHOOKS: [string, string][] = [
  ['Customers', 'Created'], ['Customers', 'Updated'], ['Customers', 'Deleted'],
  ['Event', 'Created'], ['Event', 'Updated'], ['Event', 'Deleted'],
  ['Events', 'Deleted'],
  ['Services', 'Created'], ['Services', 'Updated'], ['Services', 'Deleted'],
  ['Resource', 'Created'], ['Resource', 'Updated'], ['Resource', 'Deleted'],
  ['Company', 'Created'], ['Company', 'Updated'], ['Company', 'Deleted'],
  ['Manager', 'Created'], ['Manager', 'Updated'], ['Manager', 'Deleted'],
  ['Enterprise', 'Updated'],
  ['Customer Fields', 'Created'], ['Customer Fields', 'Updated'], ['Customer Fields', 'Deleted'],
  ['Shift', 'Created'], ['Shift', 'Updated'], ['Shift', 'Deleted'],
  ['Notification', 'Created'],
  ['Service Groups', 'Created'], ['Service Groups', 'Updated'], ['Service Groups', 'Deleted'],
];

beforeAll(() => {
  process.env.TIMIFY_WEBHOOK_SECRET = SECRET;
  delete process.env.TIMIFY_WEBHOOK_HEADER; // default: Authorization
});

// ILLUSTRATIVE payload: TIMIFY's overview page does not document the field names.
function samplePayload(webhook = 'Event', type = 'Created') {
  return { webhook, type, data: { id: 'evt_123', start: '2026-10-26T09:00:00Z' } };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/timify', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

afterEach(() => {
  delete process.env.TIMIFY_WEBHOOK_HEADER;
  process.env.TIMIFY_WEBHOOK_SECRET = SECRET;
});

describe('POST /webhooks/timify', () => {
  describe('Header authentication', () => {
    it('accepts the whole header value, including the Bearer prefix', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('does not strip a Bearer prefix', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET.replace('Bearer ', '') }));
      expect(res.status).toBe(401);
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ authorization: SECRET }));
      expect(res.status).toBe(200);
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

    it('rejects everything when TIMIFY_WEBHOOK_SECRET is unset', () => {
      const headers = new Headers({ Authorization: SECRET });
      expect(verifyTimifyRequest(headers, '')).toBe(false);
      delete process.env.TIMIFY_WEBHOOK_SECRET;
      expect(verifyTimifyRequest(headers)).toBe(false);
    });

    it('reads the header named by TIMIFY_WEBHOOK_HEADER', async () => {
      process.env.TIMIFY_WEBHOOK_HEADER = 'X-Timify-Secret';
      expect((await POST(makeRequest({ 'x-timify-secret': SECRET }))).status).toBe(200);
      expect((await POST(makeRequest({ Authorization: SECRET }))).status).toBe(401);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type', async () => {
      const res = await POST(
        makeRequest({ Authorization: SECRET }, JSON.stringify(samplePayload()), 'text/plain')
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

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(WEBHOOKS)('handles %s %s', async (webhook, type) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ Authorization: SECRET }, JSON.stringify(samplePayload(webhook, type)))
      );
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unrecognised payloads', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ Authorization: SECRET }, JSON.stringify({ something: 'else' })));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });
});
