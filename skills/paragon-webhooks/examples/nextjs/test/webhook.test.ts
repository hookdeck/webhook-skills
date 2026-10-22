import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/paragon/route';
import { verifyParagonRequest } from '../lib/verify-paragon';

const SECRET = 'Bearer test_paragon_secret_0123456789';

const EVENTS = ['workflow_failure', 'credentials_failure'];

beforeAll(() => {
  process.env.PARAGON_WEBHOOK_SECRET = SECRET;
  process.env.PARAGON_WEBHOOK_HEADER = 'Authorization';
});

function samplePayload(type = 'workflow_failure') {
  return {
    type,
    timestamp: 1729629642607,
    timestampISO: '2024-10-22T20:40:42.607Z',
    message: 'Workflow “Test Workflow Name“ failed for User user_1',
    user: { id: 'user_1', metadata: {} },
    project: { id: '613b038f-e9bf-49ec-bc58-ba8d620754c7', name: 'Test Project Name' },
    integration: { id: '57a96b31-c69e-421a-bb32-7a25f9c6a893', type: 'slack' },
    data: { type, error: 'Test error message' },
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload())
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/paragon', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('POST /webhooks/paragon', () => {
  describe('Shared credential verification', () => {
    it('accepts the exact header value', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ authorization: SECRET }));
      expect(res.status).toBe(200);
    });

    it('compares the whole value: does not strip a Bearer prefix', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET.replace(/^Bearer /, '') }));
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

    it('rejects everything when no secret is configured', () => {
      const headers = new Headers({ authorization: SECRET });
      expect(verifyParagonRequest(headers, '')).toBe(false);
      expect(verifyParagonRequest(headers, SECRET)).toBe(true);
    });

    it('reads a custom header name', () => {
      const headers = new Headers({ 'x-paragon-secret': 'abc123' });
      expect(verifyParagonRequest(headers, 'abc123', 'X-Paragon-Secret')).toBe(true);
      expect(verifyParagonRequest(headers, 'abc123', 'Authorization')).toBe(false);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type', async () => {
      const req = new NextRequest('http://localhost:3000/webhooks/paragon', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', authorization: SECRET },
        body: JSON.stringify(samplePayload()),
      });
      expect((await POST(req)).status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the credential', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (type) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ Authorization: SECRET }, JSON.stringify(samplePayload(type))));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ Authorization: SECRET }, JSON.stringify(samplePayload('something_new')))
      );
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });
});
