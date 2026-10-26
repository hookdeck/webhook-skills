import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, PUT, PATCH } from '../app/webhooks/tanium/route';
import { verifyTaniumRequest } from '../lib/verify-tanium';

const HEADER = 'X-Tanium-Secret';
const SECRET = 'Bearer test_tanium_secret_0123456789';

beforeAll(() => {
  process.env.TANIUM_WEBHOOK_HEADER = HEADER;
  process.env.TANIUM_WEBHOOK_SECRET = SECRET;
});

// Illustrative payload: Tanium has no event field. The real body is whatever the
// Connect connection is configured to send (source rows with the chosen columns).
const RECORDS = [
  { 'Computer Name': 'host-1.example.com', 'IP Address': '10.0.0.5', 'Operating System': 'Windows Server 2022' },
  { 'Computer Name': 'host-2.example.com', 'IP Address': '10.0.0.6', 'Operating System': 'Ubuntu 24.04' },
];

function makeRequest(
  headers: Record<string, string> = {},
  body: string | null = JSON.stringify(RECORDS),
  method = 'POST'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/tanium', {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(body === null ? {} : { body }),
  });
}

describe('/webhooks/tanium', () => {
  describe('Header authentication', () => {
    it('accepts the correct header value', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ [HEADER.toLowerCase()]: SECRET }));
      expect(res.status).toBe(200);
    });

    it('compares the whole value, prefix included', async () => {
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

    it('rejects the secret sent under a different header', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(401);
    });

    it('rejects everything when no secret is configured', () => {
      const headers = new Headers({ [HEADER]: SECRET });
      expect(verifyTaniumRequest(headers, '', HEADER)).toBe(false);
      expect(verifyTaniumRequest(headers, SECRET, HEADER)).toBe(true);
    });

    it('defaults the header name to Authorization', () => {
      const saved = process.env.TANIUM_WEBHOOK_HEADER;
      delete process.env.TANIUM_WEBHOOK_HEADER;
      expect(verifyTaniumRequest(new Headers({ Authorization: SECRET }), SECRET)).toBe(true);
      expect(verifyTaniumRequest(new Headers({ [HEADER]: SECRET }), SECRET)).toBe(false);
      process.env.TANIUM_WEBHOOK_HEADER = saved;
    });
  });

  describe('Methods', () => {
    it.each([
      ['POST', POST],
      ['PUT', PUT],
      ['PATCH', PATCH],
    ])('accepts %s', async (method, handler) => {
      const res = await handler(makeRequest({ [HEADER]: SECRET }, JSON.stringify(RECORDS), method));
      expect(res.status).toBe(200);
    });

    it('authenticates PUT too', async () => {
      expect((await PUT(makeRequest({}, JSON.stringify(RECORDS), 'PUT'))).status).toBe(401);
    });
  });

  describe('Body handling', () => {
    it('accepts a JSON array of records', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(spy).toHaveBeenCalledWith('Received 2 record(s) from Tanium Connect');
      spy.mockRestore();
    });

    it('accepts a single JSON object', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(RECORDS[0])));
      expect(res.status).toBe(200);
      expect(spy).toHaveBeenCalledWith('Received 1 record(s) from Tanium Connect');
      spy.mockRestore();
    });

    it('accepts any content type', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET, 'content-type': 'text/plain' }));
      expect(res.status).toBe(200);
    });

    it('accepts an empty body', async () => {
      expect((await POST(makeRequest({ [HEADER]: SECRET }, null))).status).toBe(200);
      expect((await POST(makeRequest({ [HEADER]: SECRET }, ''))).status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a scalar JSON body', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '42'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });
});
