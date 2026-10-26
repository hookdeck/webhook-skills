import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const HEADER = 'X-Onelogin-Secret';
const SECRET = 'Bearer test_onelogin_secret_0123456789';

const EVENT_TYPE_IDS = [5, 6, 7, 8, 11, 22];

function sampleEvent(eventTypeId = 5) {
  return {
    event_type_id: eventTypeId,
    account_id: 92920,
    user_id: 32916209,
    user_name: 'John Richards',
    ipaddr: '125.236.219.21',
    app_name: null,
    risk_score: null,
    uuid: 'd210df80-ede8-42ba-8199-00ce951bc222',
    event_timestamp: '2017-12-05 19:13:06 UTC',
  };
}

function makeRequest(
  body: string = JSON.stringify([sampleEvent()]),
  headers: Record<string, string> = {},
  contentType = 'application/json'
) {
  return new NextRequest('http://localhost:3000/webhooks/onelogin', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.ONELOGIN_WEBHOOK_HEADER = HEADER;
  process.env.ONELOGIN_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/onelogin/route'));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OneLogin webhook route', () => {
  describe('custom header authentication', () => {
    it('accepts the exact header value', async () => {
      const res = await POST(makeRequest(undefined, { [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: 1 });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest(undefined, { [HEADER.toLowerCase()]: SECRET }));
      expect(res.status).toBe(200);
    });

    it('compares the whole value: does not strip a Bearer prefix', async () => {
      const res = await POST(makeRequest(undefined, { [HEADER]: SECRET.replace('Bearer ', '') }));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await POST(makeRequest(undefined, { [HEADER]: 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await POST(makeRequest(undefined, { [HEADER]: 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects the secret sent under a different header name', async () => {
      const res = await POST(makeRequest(undefined, { Authorization: SECRET }));
      expect(res.status).toBe(401);
    });

    it('rejects everything when the secret is unset', async () => {
      const { verifyOneLoginRequest } = await import('../lib/verify-onelogin');
      const headers = new Headers({ [HEADER]: SECRET });
      expect(verifyOneLoginRequest(headers, '', HEADER)).toBe(false);
      expect(verifyOneLoginRequest(headers, SECRET, HEADER)).toBe(true);
    });

    it('defaults the header name to Authorization', async () => {
      const { verifyOneLoginRequest } = await import('../lib/verify-onelogin');
      delete process.env.ONELOGIN_WEBHOOK_HEADER;
      expect(verifyOneLoginRequest(new Headers({ Authorization: SECRET }))).toBe(true);
      process.env.ONELOGIN_WEBHOOK_HEADER = HEADER;
    });
  });

  describe('body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await POST(makeRequest(JSON.stringify([sampleEvent()]), { [HEADER]: SECRET }, 'text/plain'));
      expect(res.status).toBe(200);
    });

    it('iterates every event in the array', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const body = JSON.stringify([sampleEvent(5), sampleEvent(6), sampleEvent(7)]);
      const res = await POST(makeRequest(body, { [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: 3 });
      expect(spy).toHaveBeenCalledTimes(3);
    });

    it('returns 400 for newline-delimited events (only the JSON Array format is documented)', async () => {
      const body = [sampleEvent(5), sampleEvent(6)].map((e) => JSON.stringify(e)).join('\n');
      const res = await POST(makeRequest(body, { [HEADER]: SECRET }, 'text/plain'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest('{not json', { [HEADER]: SECRET }));
      expect(res.status).toBe(400);
    });

    it('returns 400 for an array of non-objects', async () => {
      const res = await POST(makeRequest('[1,2]', { [HEADER]: SECRET }));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await POST(makeRequest('{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('event handling', () => {
    it.each(EVENT_TYPE_IDS)('handles event_type_id %i', async (id) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest(JSON.stringify([sampleEvent(id)]), { [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
    });

    it('acknowledges unknown event types', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest(JSON.stringify([sampleEvent(999)]), { [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(true);
    });
  });
});
