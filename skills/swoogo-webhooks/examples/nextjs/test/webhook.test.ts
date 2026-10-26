import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/swoogo/route';
import { verifySwoogoRequest } from '../lib/verify-swoogo';

const SECRET = 'Bearer test_swoogo_secret_0123456789';

const OBJECTS = [
  'event', 'contact', 'registrant', 'speaker', 'sponsor', 'session',
  'session_attendance', 'registrant_line_item',
];

// Illustrative: Swoogo documents no delivered example, the body carries the chosen fields.
const PAYLOAD = { id: 1234, first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' };

beforeAll(() => {
  process.env.SWOOGO_WEBHOOK_HEADER = 'Authorization';
  process.env.SWOOGO_WEBHOOK_SECRET = SECRET;
});

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(PAYLOAD),
  object = 'registrant',
  contentType = 'application/json'
): NextRequest {
  return new NextRequest(`http://localhost:3000/webhooks/swoogo?object=${object}`, {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/swoogo', () => {
  describe('secret header verification', () => {
    it('accepts the exact whole header value', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ authorization: SECRET }));
      expect(res.status).toBe(200);
    });

    it('does not strip a Bearer prefix', async () => {
      const res = await POST(makeRequest({ Authorization: 'test_swoogo_secret_0123456789' }));
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

    it('reads a custom header name', () => {
      const headers = new Headers({ 'x-webhook-secret': 's3cret value' });
      expect(verifySwoogoRequest(headers, 'X-Webhook-Secret', 's3cret value')).toBe(true);
      expect(verifySwoogoRequest(headers, 'X-Webhook-Secret', 's3cret')).toBe(false);
      expect(verifySwoogoRequest(headers, 'Authorization', 's3cret value')).toBe(false);
    });

    it('rejects everything when no secret is configured', () => {
      const headers = new Headers({ authorization: SECRET });
      expect(verifySwoogoRequest(headers, 'Authorization', '')).toBe(false);
      expect(verifySwoogoRequest(headers, 'Authorization', SECRET)).toBe(true);
    });
  });

  describe('body handling', () => {
    it('accepts a form-encoded body', async () => {
      const res = await POST(
        makeRequest(
          { Authorization: SECRET },
          'id=1234&first_name=Ada&email=ada%40example.com',
          'registrant',
          'application/x-www-form-urlencoded'
        )
      );
      expect(res.status).toBe(200);
    });

    it('accepts any other content type carrying JSON', async () => {
      const res = await POST(
        makeRequest({ Authorization: SECRET }, JSON.stringify(PAYLOAD), 'registrant', 'text/plain')
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

    it('returns 401, not 400, for an invalid body without the header', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('trigger objects', () => {
    it.each(OBJECTS)('handles %s', async (object) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ Authorization: SECRET }, JSON.stringify(PAYLOAD), object));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges an unknown object', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ Authorization: SECRET }, JSON.stringify(PAYLOAD), 'something_new'));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });
});
