import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/firstbase/route';
import { verifyFirstbaseRequest } from '../lib/verify-firstbase';

const HEADER = 'X-Firstbase-Key';
const SECRET = 'Bearer test_firstbase_secret_0123456789';

const EVENT_TYPES = ['CREATED', 'UPDATED', 'DELETED'];

beforeAll(() => {
  process.env.FIRSTBASE_WEBHOOK_HEADER = HEADER;
  process.env.FIRSTBASE_WEBHOOK_SECRET = SECRET;
});

function samplePayload(eventType = 'CREATED') {
  return { eventType, id: 'ord_12345' };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/firstbase', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/firstbase', () => {
  describe('custom header verification', () => {
    it('accepts the exact header value', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ [HEADER.toLowerCase()]: SECRET }));
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

    it('rejects a wrong value of a different length', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects the secret sent under a different header name', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(401);
    });

    it('rejects everything when the secret is not configured', () => {
      const headers = new Headers({ [HEADER]: SECRET });
      expect(verifyFirstbaseRequest(headers, HEADER, '')).toBe(false);
      delete process.env.FIRSTBASE_WEBHOOK_SECRET;
      try {
        expect(verifyFirstbaseRequest(headers, HEADER)).toBe(false);
      } finally {
        process.env.FIRSTBASE_WEBHOOK_SECRET = SECRET;
      }
    });

    it('defaults the header name to Authorization', () => {
      const saved = process.env.FIRSTBASE_WEBHOOK_HEADER;
      delete process.env.FIRSTBASE_WEBHOOK_HEADER;
      try {
        expect(verifyFirstbaseRequest(new Headers({ Authorization: SECRET }))).toBe(true);
        expect(verifyFirstbaseRequest(new Headers({ [HEADER]: SECRET }))).toBe(false);
      } finally {
        process.env.FIRSTBASE_WEBHOOK_HEADER = saved;
      }
    });
  });

  describe('body handling', () => {
    it.each(EVENT_TYPES)('handles %s notifications', async (eventType) => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload(eventType))));
      expect(res.status).toBe(200);
    });

    it('accepts an unknown eventType', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload('ARCHIVED'))));
      expect(res.status).toBe(200);
    });

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

    it('returns 400 for a non-object body', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it('authenticates before parsing: bad credential and bad JSON is 401', async () => {
      const res = await POST(makeRequest({}, 'not json'));
      expect(res.status).toBe(401);
    });
  });
});
