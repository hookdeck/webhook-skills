import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, PUT, PATCH, GET } from '../app/webhooks/prefect/route';
import { verifyPrefectRequest } from '../lib/verify-prefect';

const HEADER = 'X-Prefect-Secret';
const SECRET = 'Bearer test_prefect_secret_0123456789';

beforeAll(() => {
  process.env.PREFECT_WEBHOOK_HEADER = HEADER;
  process.env.PREFECT_WEBHOOK_SECRET = SECRET;
});

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Illustrative template: {"subject": "{{subject}}", "body": "{{body}}", "name": "{{name}}"}
function samplePayload(subject = 'Flow run my-run entered state Failed') {
  return { subject, body: 'Flow run failed: boom', name: 'my-webhook-block' };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string | null = JSON.stringify(samplePayload()),
  method = 'POST',
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/prefect', {
    method,
    headers: { 'content-type': contentType, ...headers },
    ...(body === null ? {} : { body }),
  });
}

describe('/webhooks/prefect', () => {
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

    it('compares the whole value: the part after "Bearer " alone is rejected', async () => {
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

    it('ignores the secret under a different header name', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(401);
    });

    it('rejects everything when PREFECT_WEBHOOK_SECRET is unset', () => {
      const headers = new Headers({ [HEADER]: SECRET });
      expect(verifyPrefectRequest(headers, '', HEADER)).toBe(false);
    });

    it('defaults the header name to Authorization', () => {
      const saved = process.env.PREFECT_WEBHOOK_HEADER;
      delete process.env.PREFECT_WEBHOOK_HEADER;
      expect(verifyPrefectRequest(new Headers({ Authorization: SECRET }))).toBe(true);
      process.env.PREFECT_WEBHOOK_HEADER = saved;
    });
  });

  describe('request methods', () => {
    it('accepts POST, PUT and PATCH with a body', async () => {
      for (const [method, fn] of [['POST', POST], ['PUT', PUT], ['PATCH', PATCH]] as const) {
        const res = await fn(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload()), method));
        expect(res.status).toBe(200);
      }
    });

    it('accepts GET with an empty body', async () => {
      const res = await GET(makeRequest({ [HEADER]: SECRET }, null, 'GET'));
      expect(res.status).toBe(200);
    });

    it('authenticates GET too', async () => {
      const res = await GET(makeRequest({}, null, 'GET'));
      expect(res.status).toBe(401);
    });
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload()), 'POST', 'text/plain'));
      expect(res.status).toBe(200);
    });

    it('accepts a form-encoded body (form_data template)', async () => {
      const res = await POST(
        makeRequest({ [HEADER]: SECRET }, 'subject=Failed&body=boom&name=blk', 'POST', 'application/x-www-form-urlencoded')
      );
      expect(res.status).toBe(200);
    });

    it('accepts an empty POST body', async () => {
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

  describe('notification handling', () => {
    it('logs the substituted subject, body and name', async () => {
      const spy = vi.spyOn(console, 'log');
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).includes('my-webhook-block'))).toBe(true);
    });
  });
});
