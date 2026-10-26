import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/clickhouse/route';
import { verifyClickHouseRequest } from '../lib/verify-clickhouse';

const HEADER = 'X-ClickStack-Secret';
const SECRET = 'Bearer test_clickhouse_secret_0123456789';

beforeAll(() => {
  process.env.CLICKHOUSE_WEBHOOK_HEADER = HEADER;
  process.env.CLICKHOUSE_WEBHOOK_SECRET = SECRET;
});

// Illustrative payload from the template {"title":"{{title}}","body":"{{body}}","link":"{{link}}"}
const samplePayload = {
  title: 'High error rate',
  body: 'Alert fired: error count >= 100 over 5m',
  link: 'https://clickstack.example.com/search/abc123',
};

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/clickhouse', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/clickhouse', () => {
  describe('secret header verification', () => {
    it('accepts the correct whole value', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ [HEADER.toLowerCase()]: SECRET }));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'short' }));
      expect(res.status).toBe(401);
    });

    it('does not strip a Bearer prefix (whole-value compare)', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET.replace(/^Bearer /, '') }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('ignores the secret in a different header', async () => {
      const res = await POST(makeRequest({ authorization: SECRET }));
      expect(res.status).toBe(401);
    });

    it('defaults to the Authorization header', () => {
      const env = { CLICKHOUSE_WEBHOOK_SECRET: 'Bearer abc' };
      expect(verifyClickHouseRequest(new Headers({ authorization: 'Bearer abc' }), env)).toBe(true);
      expect(verifyClickHouseRequest(new Headers({ authorization: 'abc' }), env)).toBe(false);
    });

    it('rejects everything when the secret is unset', () => {
      expect(verifyClickHouseRequest(new Headers({ [HEADER]: SECRET }), {})).toBe(false);
      expect(
        verifyClickHouseRequest(new Headers({ [HEADER]: '' }), { CLICKHOUSE_WEBHOOK_SECRET: '' })
      ).toBe(false);
    });
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const res = await POST(
        makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload), 'text/plain')
      );
      expect(res.status).toBe(200);
    });

    it('accepts a non-JSON body as plain text', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ [HEADER]: SECRET }, 'High error rate - see link', 'text/plain')
      );
      expect(res.status).toBe(200);
      expect(String(spy.mock.calls[0][0])).toContain('High error rate - see link');
      spy.mockRestore();
    });

    it('returns 401, not 200, for a bad body without the header', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });

    it('logs the title, body and link from a JSON template', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      const line = String(spy.mock.calls[0][0]);
      expect(line).toContain('High error rate');
      expect(line).toContain('https://clickstack.example.com/search/abc123');
      spy.mockRestore();
    });
  });
});
