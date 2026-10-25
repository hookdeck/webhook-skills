import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/acumatica/route';
import { verifyAcumaticaRequest } from '../lib/verify-acumatica';

const HEADER = 'X-Acumatica-Key';
const SECRET = 'Bearer test_acumatica_secret_0123456789';

beforeAll(() => {
  process.env.ACUMATICA_WEBHOOK_HEADER = HEADER;
  process.env.ACUMATICA_WEBHOOK_SECRET = SECRET;
});

let counter = 0;

function samplePayload(overrides: Record<string, unknown> = {}) {
  counter += 1;
  return {
    Inserted: [{ InventoryID: 'AACOMPUT01', StockItem: true, ItemStatus: 'Inactive' }],
    Deleted: [{ InventoryID: 'AACOMPUT01', StockItem: true, ItemStatus: 'Active' }],
    Query: 'Stock Items: Last Modified Date',
    CompanyId: 'MyTenant',
    Id: `1af4d140-5321-41f2-a2ec-50b67f577c${String(counter).padStart(2, '0')}`,
    TimeStamp: 636295833829493672,
    AdditionalInfo: {},
    ...overrides,
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/acumatica', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/acumatica', () => {
  describe('secret header verification', () => {
    it('accepts the correct header value', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ [HEADER.toUpperCase()]: SECRET }));
      expect(res.status).toBe(200);
    });

    it('compares the whole value, including the Bearer prefix', async () => {
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

    it('rejects the secret sent in a different header', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(401);
    });

    it('authenticates before parsing the body', async () => {
      const res = await POST(makeRequest({}, 'not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const res = await POST(
        makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload()), 'text/plain')
      );
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, 'not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a JSON array', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '[]'));
      expect(res.status).toBe(400);
    });
  });

  describe('notification handling', () => {
    const cases: Record<string, Record<string, unknown>> = {
      inserted: { Deleted: [] },
      deleted: { Inserted: [] },
      updated: {},
      empty: { Inserted: [], Deleted: [] },
    };

    for (const [change, overrides] of Object.entries(cases)) {
      it(`handles a ${change} notification`, async () => {
        const res = await POST(
          makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload(overrides)))
        );
        expect(res.status).toBe(200);
      });
    }

    it('acknowledges a duplicate Id with 200', async () => {
      const body = JSON.stringify(samplePayload());
      expect((await POST(makeRequest({ [HEADER]: SECRET }, body))).status).toBe(200);
      expect((await POST(makeRequest({ [HEADER]: SECRET }, body))).status).toBe(200);
    });
  });

  describe('verifyAcumaticaRequest()', () => {
    it('defaults the header name to Authorization', () => {
      const env = { ACUMATICA_WEBHOOK_SECRET: 'Bearer abc' };
      expect(verifyAcumaticaRequest(new Headers({ authorization: 'Bearer abc' }), env)).toBe(true);
    });

    it('fails closed when the secret is unset', () => {
      expect(verifyAcumaticaRequest(new Headers({ authorization: '' }), {})).toBe(false);
      expect(verifyAcumaticaRequest(new Headers(), {})).toBe(false);
    });
  });
});
