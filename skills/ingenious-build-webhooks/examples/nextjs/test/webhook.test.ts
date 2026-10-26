import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/ingenious-build/route';
import { verifyIngeniousBuildRequest } from '../lib/verify-ingenious-build';

const SECRET = 'Bearer test_ingenious_build_token_0123456789';

const EVENTS: Record<string, string> = {
  budget_exported_to_accounting: 'budget',
  budget_change_exported_to_accounting: 'budget_change',
  contract_exported_to_accounting: 'contract',
  contract_change_exported_to_accounting: 'contract_change',
  invoice_exported_to_accounting: 'invoice',
};

beforeAll(() => {
  process.env.INGENIOUS_BUILD_WEBHOOK_HEADER = 'Authorization';
  process.env.INGENIOUS_BUILD_WEBHOOK_SECRET = SECRET;
});

function samplePayload(name = 'invoice_exported_to_accounting') {
  return {
    name,
    subject: EVENTS[name] ?? 'other',
    data: { id: '507f1f77bcf86cd799439012', invoice_number: 'INV-123', gross_value: '1000.00', items: [] },
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload())
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/ingenious-build', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('POST /webhooks/ingenious-build', () => {
  describe('auth header verification', () => {
    it('accepts the exact header value', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ authorization: SECRET }));
      expect(res.status).toBe(200);
    });

    it('compares the whole value: the bare token without "Bearer " is rejected', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET.replace('Bearer ', '') }));
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
      const headers = new Headers({ 'x-ib-token': 's3cret' });
      expect(verifyIngeniousBuildRequest(headers, 'X-IB-Token', 's3cret')).toBe(true);
      expect(verifyIngeniousBuildRequest(headers, 'Authorization', 's3cret')).toBe(false);
    });

    it('rejects everything when no secret is configured', () => {
      const headers = new Headers({ authorization: SECRET });
      expect(verifyIngeniousBuildRequest(headers, 'Authorization', '')).toBe(false);
      expect(verifyIngeniousBuildRequest(headers, 'Authorization', SECRET)).toBe(true);
    });
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const req = new NextRequest('http://localhost:3000/webhooks/ingenious-build', {
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

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('event handling', () => {
    it.each(Object.keys(EVENTS))('handles %s', async (name) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ Authorization: SECRET }, JSON.stringify(samplePayload(name))));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ Authorization: SECRET }, JSON.stringify(samplePayload('something_new'))));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });
});
