import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, PUT, PATCH, DELETE } from '../app/webhooks/rebilly/route';
import { verifyRebillyRequest } from '../lib/verify-rebilly';

const USERNAME = 'rebilly_test_user';
const PASSWORD = 'p@ss:word/with:colons+and=signs';

const HANDLERS = { GET, POST, PUT, PATCH, DELETE };

const EVENTS: Record<string, Record<string, string>> = {
  'transaction-processed': { transactionId: 'txn_123' },
  'transaction-declined': { transactionId: 'txn_124' },
  'customer-created': { customerId: 'cus_123' },
  'subscription-activated': { subscriptionId: 'sub_123' },
  'subscription-canceled': { subscriptionId: 'sub_124' },
  'invoice-issued': { invoiceId: 'inv_123' },
  'invoice-paid': { invoiceId: 'inv_124' },
};

// Payload as shown in Rebilly's documentation (data-export-completed).
const DATA_EXPORT_COMPLETED = {
  dataExportId: 'd9dd134f-0bee-46b1-bec0-992da3173336',
  fileId: 'd348968b-41ed-4d7d-b534-02e5265c8912',
  eventType: 'data-export-completed',
  _embedded: {
    dataExport: {
      id: 'd9dd134f-0bee-46b1-bec0-992da3173336',
      name: 'Preview',
      resource: 'customers',
      format: 'csv',
      status: 'pending',
      _links: [
        {
          rel: 'self',
          href: 'https://api-sandbox.rebilly.com/organizations/a9f68e6e-e2e6-43dd-a27f-8120121d7428/experimental/data-exports/d9dd134f-0bee-46b1-bec0-992da3173336',
        },
      ],
    },
  },
  _links: [
    {
      rel: 'download',
      href: 'https://api-sandbox.rebilly.com/organizations/a9f68e6e-e2e6-43dd-a27f-8120121d7428/files/d348968b-41ed-4d7d-b534-02e5265c8912/download',
    },
  ],
};

beforeAll(() => {
  process.env.REBILLY_WEBHOOK_USERNAME = USERNAME;
  process.env.REBILLY_WEBHOOK_PASSWORD = PASSWORD;
});

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function basic(username = USERNAME, password = PASSWORD): string {
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}

function payloadFor(eventType: string) {
  if (eventType === 'data-export-completed') return DATA_EXPORT_COMPLETED;
  return { eventType, ...EVENTS[eventType], _embedded: {}, _links: [] };
}

function makeRequest(
  method: string,
  headers: Record<string, string> = {},
  body?: string
): NextRequest {
  const hasBody = body !== undefined && method !== 'GET';
  return new NextRequest('http://localhost:3000/webhooks/rebilly', {
    method,
    headers: { ...(hasBody ? { 'content-type': 'application/json' } : {}), ...headers },
    body: hasBody ? body : undefined,
  });
}

describe('/webhooks/rebilly', () => {
  describe('basic auth verification', () => {
    it('accepts the correct credentials', async () => {
      const res = await POST(
        makeRequest('POST', { authorization: basic() }, JSON.stringify(payloadFor('transaction-processed')))
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts a lowercase scheme and a password containing colons', async () => {
      const res = await POST(
        makeRequest(
          'POST',
          { authorization: basic().replace('Basic', 'basic') },
          JSON.stringify(payloadFor('customer-created'))
        )
      );
      expect(res.status).toBe(200);
    });

    it('rejects a missing Authorization header', async () => {
      const res = await POST(makeRequest('POST', {}, JSON.stringify(payloadFor('transaction-processed'))));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong password', async () => {
      const res = await POST(makeRequest('POST', { authorization: basic(USERNAME, 'wrong') }, '{}'));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong username', async () => {
      const res = await POST(makeRequest('POST', { authorization: basic('someone-else', PASSWORD) }, '{}'));
      expect(res.status).toBe(401);
    });

    it('rejects a non-Basic scheme', async () => {
      const res = await POST(makeRequest('POST', { authorization: `Bearer ${PASSWORD}` }, '{}'));
      expect(res.status).toBe(401);
    });

    it('rejects base64 with trailing junk', async () => {
      const res = await POST(makeRequest('POST', { authorization: `${basic()}!!!` }, '{}'));
      expect(res.status).toBe(401);
    });

    it('rejects credentials without a colon', async () => {
      const res = await POST(
        makeRequest('POST', { authorization: 'Basic ' + Buffer.from('nocolon').toString('base64') }, '{}')
      );
      expect(res.status).toBe(401);
    });

    it('does not read the body before authenticating', async () => {
      const res = await POST(makeRequest('POST', {}, 'not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('methods', () => {
    for (const [method, handler] of Object.entries(HANDLERS)) {
      it(`accepts ${method} with valid credentials and an empty body`, async () => {
        const res = await handler(makeRequest(method, { authorization: basic() }));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ received: true });
      });

      it(`rejects ${method} without credentials`, async () => {
        const res = await handler(makeRequest(method));
        expect(res.status).toBe(401);
      });
    }

    it.each([['PUT', PUT], ['PATCH', PATCH]] as const)('handles an event sent with %s', async (method, handler) => {
      const res = await handler(
        makeRequest(method, { authorization: basic() }, JSON.stringify(payloadFor('invoice-paid')))
      );
      expect(res.status).toBe(200);
    });
  });

  describe('events', () => {
    const names = [...Object.keys(EVENTS), 'data-export-completed'];

    it.each(names)('handles %s and returns exactly 200', async (eventType) => {
      const res = await POST(
        makeRequest('POST', { authorization: basic() }, JSON.stringify(payloadFor(eventType)))
      );
      expect(res.status).toBe(200);
    });

    it('logs the event it handled', async () => {
      await POST(makeRequest('POST', { authorization: basic() }, JSON.stringify(DATA_EXPORT_COMPLETED)));
      expect(console.log).toHaveBeenCalledWith('Data export completed: d9dd134f-0bee-46b1-bec0-992da3173336');
    });

    it('returns 200 for unknown events', async () => {
      const res = await POST(
        makeRequest('POST', { authorization: basic() }, JSON.stringify({ eventType: 'brand-new-event' }))
      );
      expect(res.status).toBe(200);
    });

    it('accepts any content type', async () => {
      const res = await POST(
        makeRequest(
          'POST',
          { authorization: basic(), 'content-type': 'text/plain' },
          JSON.stringify(payloadFor('customer-created'))
        )
      );
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest('POST', { authorization: basic() }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object body', async () => {
      const res = await POST(makeRequest('POST', { authorization: basic() }, '[1,2,3]'));
      expect(res.status).toBe(400);
    });
  });

  describe('verifyRebillyRequest', () => {
    const headersWith = (authorization: string) => new Headers({ authorization });

    it('fails closed when credentials are not configured', () => {
      expect(verifyRebillyRequest(headersWith(basic()), '', '')).toBe(false);
    });

    it('fails closed when the environment variables are unset', () => {
      delete process.env.REBILLY_WEBHOOK_USERNAME;
      delete process.env.REBILLY_WEBHOOK_PASSWORD;
      try {
        expect(verifyRebillyRequest(headersWith(basic()))).toBe(false);
      } finally {
        process.env.REBILLY_WEBHOOK_USERNAME = USERNAME;
        process.env.REBILLY_WEBHOOK_PASSWORD = PASSWORD;
      }
    });

    it('verifies against explicit credentials', () => {
      expect(verifyRebillyRequest(headersWith(basic('a', 'b')), 'a', 'b')).toBe(true);
      expect(verifyRebillyRequest(headersWith(basic('a', 'b')), 'a', 'c')).toBe(false);
    });

    it('handles non-ASCII credentials', () => {
      expect(verifyRebillyRequest(headersWith(basic('usér', 'pässwörd')), 'usér', 'pässwörd')).toBe(true);
    });
  });
});
