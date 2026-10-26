import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/gc-notify/route';
import { verifyGcNotifyRequest } from '../lib/verify-gc-notify';

const SECRET = 'test_gc_notify_bearer_token_0123456789';
const AUTH = `Bearer ${SECRET}`;

const STATUSES = [
  'created', 'sending', 'pending', 'sent', 'delivered', 'permanent-failure',
  'temporary-failure', 'technical-failure', 'pending-virus-check', 'virus-scan-failed',
];

beforeAll(() => {
  process.env.GC_NOTIFY_WEBHOOK_SECRET = SECRET;
});

// Built from the field table in the GC Notify callbacks documentation (not a captured delivery).
function receipt(status = 'delivered') {
  return {
    id: '3b0f9c1e-6d6b-4a6c-9f1e-0a4d3d3f9e11',
    reference: '12345678',
    to: 'hello@canada.ca',
    status,
    status_description: 'Delivered',
    provider_response: null,
    created_at: '2017-05-14T12:15:30.000000Z',
    completed_at: '2017-05-14T12:15:30.000000Z',
    sent_at: '2017-05-14T12:15:30.000000Z',
    notification_type: 'email',
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(receipt())
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/gc-notify', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('POST /webhooks/gc-notify', () => {
  describe('Bearer token verification', () => {
    it('accepts the correct token', async () => {
      const res = await POST(makeRequest({ Authorization: AUTH }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the scheme case-insensitively', async () => {
      for (const scheme of ['bearer', 'BEARER', 'BeArEr']) {
        const res = await POST(makeRequest({ Authorization: `${scheme} ${SECRET}` }));
        expect(res.status).toBe(200);
      }
    });

    it('rejects a wrong token of the same length', async () => {
      const res = await POST(makeRequest({ Authorization: `Bearer ${'x'.repeat(SECRET.length)}` }));
      expect(res.status).toBe(401);
    });

    it('rejects a token of a different length without throwing', async () => {
      const res = await POST(makeRequest({ Authorization: 'Bearer short' }));
      expect(res.status).toBe(401);
    });

    it('rejects the bare secret without a scheme', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(401);
    });

    it('rejects another scheme', async () => {
      const res = await POST(makeRequest({ Authorization: `Basic ${SECRET}` }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing Authorization header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects everything when the secret is unset', () => {
      const headers = new Headers({ authorization: AUTH });
      expect(verifyGcNotifyRequest(headers, '')).toBe(false);
      expect(verifyGcNotifyRequest(headers, 'Bearer ')).toBe(false);
      delete process.env.GC_NOTIFY_WEBHOOK_SECRET;
      expect(verifyGcNotifyRequest(headers)).toBe(false);
      process.env.GC_NOTIFY_WEBHOOK_SECRET = SECRET;
    });

    it('accepts a configured secret that was pasted with the Bearer scheme', () => {
      const headers = new Headers({ authorization: AUTH });
      expect(verifyGcNotifyRequest(headers, `Bearer ${SECRET}`)).toBe(true);
      expect(verifyGcNotifyRequest(headers, `bearer ${SECRET}`)).toBe(true);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type', async () => {
      const req = new NextRequest('http://localhost:3000/webhooks/gc-notify', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', Authorization: AUTH },
        body: JSON.stringify(receipt()),
      });
      expect((await POST(req)).status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ Authorization: AUTH }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest({ Authorization: AUTH }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without a token', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('Receipt handling', () => {
    it.each(STATUSES)('handles %s', async (status) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ Authorization: AUTH }, JSON.stringify(receipt(status))));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges the health check body', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ Authorization: AUTH }, JSON.stringify({ health_check: 'true' })));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown statuses', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ Authorization: AUTH }, JSON.stringify(receipt('something-new'))));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });
});
