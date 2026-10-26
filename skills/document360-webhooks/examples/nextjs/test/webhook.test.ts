import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, PUT } from '../app/webhooks/document360/route';
import { verifyDocument360Request } from '../lib/verify-document360';

const HEADER = 'X-Docs-Secret';
const SECRET = 'Bearer test_document360_secret_0123456789';

const EVENTS = [
  'Article published', 'Article created', 'Article deleted', 'Article settings saved',
  'Article workflow status updated', 'Extension token deleted',
];

beforeAll(() => {
  process.env.DOCUMENT360_WEBHOOK_HEADER = HEADER;
  process.env.DOCUMENT360_WEBHOOK_SECRET = SECRET;
});

function samplePayload(event = 'Article published') {
  return {
    'Knowledge base name': 'Document360 2.0',
    Event: event,
    User: 'Matt Sterling',
    'User email': 'matt.sterling@document360.co',
    'Logged on (UTC)': '09/12/2025 06:15:00',
    'Article name': 'Getting Started',
    'Article id': 'e1444f0x-0xx0-000x-xxx0-0x3f2bc3713c',
    Language: 'English',
    'Language code': 'en',
  };
}

function makeRequest(
  method: 'POST' | 'PUT',
  headers: Record<string, string> = {},
  body: string | null = JSON.stringify(samplePayload()),
  contentType: string | null = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/document360', {
    method,
    headers: { ...(contentType ? { 'content-type': contentType } : {}), ...headers },
    ...(body === null ? {} : { body }),
  });
}

describe('/webhooks/document360', () => {
  describe('credential header verification', () => {
    it('accepts the correct header value on POST', async () => {
      const res = await POST(makeRequest('POST', { [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts the correct header value on PUT', async () => {
      const res = await PUT(makeRequest('PUT', { [HEADER]: SECRET }));
      expect(res.status).toBe(200);
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest('POST', { 'x-docs-secret': SECRET }));
      expect(res.status).toBe(200);
    });

    it('compares the whole value, prefix included', async () => {
      const res = await POST(makeRequest('POST', { [HEADER]: SECRET.replace('Bearer ', '') }));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await POST(makeRequest('POST', { [HEADER]: 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await POST(makeRequest('POST', { [HEADER]: 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest('POST'));
      expect(res.status).toBe(401);
    });

    it('rejects a credential sent under a different header name', async () => {
      const res = await POST(makeRequest('POST', { Authorization: SECRET }));
      expect(res.status).toBe(401);
    });

    it('authenticates before parsing the body', async () => {
      const res = await POST(makeRequest('POST', {}, 'not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('verifyDocument360Request', () => {
    it('fails closed when no secret is configured', () => {
      const headers = new Headers({ [HEADER]: 'anything' });
      expect(verifyDocument360Request(headers, '', HEADER)).toBe(false);
    });

    it('defaults the header name to Authorization', () => {
      delete process.env.DOCUMENT360_WEBHOOK_HEADER;
      try {
        expect(verifyDocument360Request(new Headers({ Authorization: SECRET }), SECRET)).toBe(true);
        expect(verifyDocument360Request(new Headers({ [HEADER]: SECRET }), SECRET)).toBe(false);
      } finally {
        process.env.DOCUMENT360_WEBHOOK_HEADER = HEADER;
      }
    });
  });

  describe('request handling', () => {
    it.each(EVENTS)('handles %s', async (event) => {
      const res = await POST(makeRequest('POST', { [HEADER]: SECRET }, JSON.stringify(samplePayload(event))));
      expect(res.status).toBe(200);
    });

    it('handles an unknown event', async () => {
      const res = await POST(
        makeRequest('POST', { [HEADER]: SECRET }, JSON.stringify(samplePayload('Something new')))
      );
      expect(res.status).toBe(200);
    });

    it('handles the article delete payload with Slugs', async () => {
      const body = JSON.stringify({
        ...samplePayload('Article deleted'),
        Slugs: [{ language: 'en', slug: 'getting-started' }],
      });
      const res = await POST(makeRequest('POST', { [HEADER]: SECRET }, body));
      expect(res.status).toBe(200);
    });

    it('accepts any content type', async () => {
      const res = await POST(
        makeRequest('POST', { [HEADER]: SECRET }, JSON.stringify(samplePayload()), 'text/plain')
      );
      expect(res.status).toBe(200);
    });

    it('accepts an empty body when authenticated', async () => {
      const res = await POST(makeRequest('POST', { [HEADER]: SECRET }, null, null));
      expect(res.status).toBe(200);
    });

    it('rejects invalid JSON with 400', async () => {
      const res = await POST(makeRequest('POST', { [HEADER]: SECRET }, 'not json'));
      expect(res.status).toBe(400);
    });

    it('rejects a non-object body with 400', async () => {
      const res = await POST(makeRequest('POST', { [HEADER]: SECRET }, '[1,2]'));
      expect(res.status).toBe(400);
    });
  });
});
