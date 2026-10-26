import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, PUT, PATCH, DELETE } from '../app/webhooks/palmetto-finance/route';
import { verifyPalmettoFinanceRequest } from '../lib/verify-palmetto-finance';

const SECRET = 'test_palmetto_server_api_key_0123456789';

const EVENTS = [
  'accountCreated', 'accountUpdated', 'sendInvite', 'applicationStatus', 'contractApproved',
  'contractSending', 'contractSent', 'contractSigned', 'contractVoided', 'contractReinstated',
  'documentStatus', 'documentUploaded', 'milestonePackage', 'milestoneAchieved',
  'milestoneStatusChanged', 'quoteCreated', 'quoteVoided', 'requirementStatusChanged',
  'requirementCompleted', 'termsAndConditionsAccepted', 'allConsumerTaskEvents',
];

beforeAll(() => {
  process.env.PALMETTO_FINANCE_WEBHOOK_HEADER = 'apiKey';
  process.env.PALMETTO_FINANCE_WEBHOOK_SECRET = SECRET;
});

function samplePayload(event = 'accountCreated') {
  return {
    event,
    accountId: 'palmetto-finance-account-id',
    accountReference: 'account-external-reference',
    organizationId: 'my-lightreach-alias',
    programType: 'solar',
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string | undefined = JSON.stringify(samplePayload()),
  method = 'POST'
): NextRequest {
  const hasBody = body !== undefined && method !== 'GET';
  return new NextRequest('http://localhost:3000/webhooks/palmetto-finance', {
    method,
    headers: { ...(hasBody ? { 'content-type': 'application/json' } : {}), ...headers },
    body: hasBody ? body : undefined,
  });
}

describe('/webhooks/palmetto-finance', () => {
  describe('API key header verification', () => {
    it('accepts the correct key', async () => {
      const res = await POST(makeRequest({ apiKey: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ APIKEY: SECRET }));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong key of the same length', async () => {
      const res = await POST(makeRequest({ apiKey: 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a key of a different length without throwing', async () => {
      const res = await POST(makeRequest({ apiKey: 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing key', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects the key sent in a different header', async () => {
      const res = await POST(makeRequest({ api_key: SECRET }));
      expect(res.status).toBe(401);
    });

    it('compares the whole value and does not strip a Bearer prefix', async () => {
      const res = await POST(makeRequest({ apiKey: `Bearer ${SECRET}` }));
      expect(res.status).toBe(401);
    });

    it('uses the whole value when the secret itself includes a Bearer prefix', () => {
      const secret = 'Bearer abc123';
      expect(verifyPalmettoFinanceRequest(new Headers({ apiKey: 'Bearer abc123' }), secret, 'apiKey')).toBe(true);
      expect(verifyPalmettoFinanceRequest(new Headers({ apiKey: 'abc123' }), secret, 'apiKey')).toBe(false);
    });

    it('supports a custom header name such as api_key', () => {
      expect(verifyPalmettoFinanceRequest(new Headers({ api_key: SECRET }), SECRET, 'api_key')).toBe(true);
      expect(verifyPalmettoFinanceRequest(new Headers({ apiKey: SECRET }), SECRET, 'api_key')).toBe(false);
    });

    it('rejects everything when the secret is unset', () => {
      const headers = new Headers({ apiKey: SECRET });
      expect(verifyPalmettoFinanceRequest(headers, '')).toBe(false);
      delete process.env.PALMETTO_FINANCE_WEBHOOK_SECRET;
      expect(verifyPalmettoFinanceRequest(headers)).toBe(false);
      process.env.PALMETTO_FINANCE_WEBHOOK_SECRET = SECRET;
    });
  });

  describe('HTTP methods', () => {
    const handlers = { GET, POST, PUT, PATCH, DELETE };

    it.each(Object.keys(handlers))('accepts %s with the key', async (method) => {
      const res = await handlers[method as keyof typeof handlers](makeRequest({ apiKey: SECRET }, undefined, method));
      expect(res.status).toBe(200);
    });

    it.each(Object.keys(handlers))('rejects %s without the key', async (method) => {
      const res = await handlers[method as keyof typeof handlers](makeRequest({}, undefined, method));
      expect(res.status).toBe(401);
    });

    it('acknowledges an empty body', async () => {
      const res = await PUT(makeRequest({ apiKey: SECRET }, '', 'PUT'));
      expect(res.status).toBe(200);
    });

    it('accepts a JSON body on PATCH', async () => {
      const res = await PATCH(makeRequest({ apiKey: SECRET }, JSON.stringify(samplePayload('quoteCreated')), 'PATCH'));
      expect(res.status).toBe(200);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (text body)', async () => {
      const req = new NextRequest('http://localhost:3000/webhooks/palmetto-finance', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', apiKey: SECRET },
        body: JSON.stringify(samplePayload()),
      });
      expect((await POST(req)).status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ apiKey: SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest({ apiKey: SECRET }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without a key', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (event) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ apiKey: SECRET }, JSON.stringify(samplePayload(event))));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ apiKey: SECRET }, JSON.stringify(samplePayload('somethingNew'))));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });
});
