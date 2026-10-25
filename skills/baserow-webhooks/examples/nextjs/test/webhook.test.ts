import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, PUT, PATCH, GET, DELETE } from '../app/webhooks/baserow/route';
import { verifyBaserowRequest } from '../lib/verify-baserow';

const HEADER = 'X-Webhook-Secret';
const SECRET = 'Bearer test_baserow_secret_0123456789';

const EVENTS = [
  'rows.created', 'rows.updated', 'rows.deleted',
  'view.created', 'view.updated', 'view.deleted',
  'field.created', 'field.updated', 'field.deleted',
];

beforeAll(() => {
  process.env.BASEROW_WEBHOOK_HEADER = HEADER;
  process.env.BASEROW_WEBHOOK_SECRET = SECRET;
});

function samplePayload(eventType = 'rows.created') {
  return {
    table_id: 50000,
    database_id: 1000,
    workspace_id: 300,
    event_id: '00000000-0000-0000-0000-000000000000',
    event_type: eventType,
    items: [{ id: 1, order: '1.00000000000000000000', field_1: 'Hello' }],
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string | null = JSON.stringify(samplePayload()),
  method = 'POST',
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/baserow', {
    method,
    headers: { 'content-type': contentType, ...headers },
    ...(body === null ? {} : { body }),
  });
}

describe('/webhooks/baserow', () => {
  describe('secret header verification', () => {
    it('accepts the correct whole header value', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ [HEADER.toLowerCase()]: SECRET }));
      expect(res.status).toBe(200);
    });

    it('does not strip a Bearer prefix', async () => {
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

    it('rejects the secret sent under a different header name', async () => {
      const res = await POST(makeRequest({ 'X-Other': SECRET }));
      expect(res.status).toBe(401);
    });

    it('rejects every request when no secret is configured', () => {
      const headers = new Headers({ [HEADER]: SECRET });
      expect(verifyBaserowRequest(headers, HEADER, '')).toBe(false);
      delete process.env.BASEROW_WEBHOOK_SECRET;
      try {
        expect(verifyBaserowRequest(headers, HEADER)).toBe(false);
      } finally {
        process.env.BASEROW_WEBHOOK_SECRET = SECRET;
      }
    });

    it('defaults the header name to Authorization', () => {
      delete process.env.BASEROW_WEBHOOK_HEADER;
      try {
        expect(verifyBaserowRequest(new Headers({ authorization: SECRET }))).toBe(true);
      } finally {
        process.env.BASEROW_WEBHOOK_HEADER = HEADER;
      }
    });
  });

  describe('HTTP methods', () => {
    const handlers = { POST, PUT, PATCH, GET, DELETE } as const;

    for (const [method, handler] of Object.entries(handlers)) {
      it(`accepts ${method} with the header`, async () => {
        // GET requests cannot carry a body in the Request constructor, so GET uses an empty body.
        const body = method === 'GET' ? null : JSON.stringify(samplePayload());
        const res = await handler(makeRequest({ [HEADER]: SECRET }, body, method));
        expect(res.status).toBe(200);
      });

      it(`rejects ${method} without the header`, async () => {
        const body = method === 'GET' ? null : JSON.stringify(samplePayload());
        const res = await handler(makeRequest({}, body, method));
        expect(res.status).toBe(401);
      });
    }
  });

  describe('body handling', () => {
    it('accepts an empty body', async () => {
      const res = await GET(makeRequest({ [HEADER]: SECRET }, null, 'GET'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts a non-JSON content type', async () => {
      const res = await POST(
        makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload()), 'POST', 'text/plain')
      );
      expect(res.status).toBe(200);
    });

    it('rejects invalid JSON with 400', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, 'not json'));
      expect(res.status).toBe(400);
    });

    it('rejects a JSON array with 400', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '[1,2]'));
      expect(res.status).toBe(400);
    });
  });

  describe('event handling', () => {
    it.each(EVENTS)('handles %s', async (eventType) => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload(eventType))));
      expect(res.status).toBe(200);
    });

    it('returns 200 for an unknown event type', async () => {
      const res = await POST(
        makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload('something.else')))
      );
      expect(res.status).toBe(200);
    });
  });
});
