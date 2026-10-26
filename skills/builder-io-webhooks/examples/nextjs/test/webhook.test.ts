import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/builder-io/route';
import { verifyBuilderRequest } from '../lib/verify-builder-io';

const HEADER = 'X-Builder-Secret';
const SECRET = 'Bearer test_builder_secret_0123456789';

const OPERATIONS = ['publish', 'unpublish', 'archive', 'delete', 'scheduledStart', 'scheduledEnd'];

beforeAll(() => {
  process.env.BUILDER_IO_WEBHOOK_HEADER = HEADER;
  process.env.BUILDER_IO_WEBHOOK_SECRET = SECRET;
});

function samplePayload(operation = 'publish') {
  return {
    newValue: operation === 'delete' ? null : { id: 'cs3df', published: 'published', name: 'My great page', data: { property: 'value' } },
    previousValue: operation === 'publish' ? null : { id: 'cs3df', published: 'draft', name: 'My great page' },
    modelName: 'page',
    operation,
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/builder-io', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/builder-io', () => {
  describe('secret header verification', () => {
    it('accepts the correct header value', async () => {
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

    it('rejects a value of a different length without throwing', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects the secret sent under a different header', async () => {
      const res = await POST(makeRequest({ 'X-Other': SECRET }));
      expect(res.status).toBe(401);
    });

    it('rejects a bad secret before parsing the body', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'wrong' }, 'not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload()), 'text/plain'));
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

  describe('operations', () => {
    it.each(OPERATIONS)('handles %s', async (operation) => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload(operation))));
      expect(res.status).toBe(200);
    });

    it('acknowledges an unknown operation', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify({ ...samplePayload(), operation: 'mystery' })));
      expect(res.status).toBe(200);
    });
  });

  describe('verifyBuilderRequest', () => {
    it('defaults to the Authorization header', () => {
      delete process.env.BUILDER_IO_WEBHOOK_HEADER;
      try {
        expect(verifyBuilderRequest(new Headers({ authorization: SECRET }))).toBe(true);
        expect(verifyBuilderRequest(new Headers({ [HEADER]: SECRET }))).toBe(false);
      } finally {
        process.env.BUILDER_IO_WEBHOOK_HEADER = HEADER;
      }
    });

    it('fails closed when no secret is configured', () => {
      expect(verifyBuilderRequest(new Headers({ [HEADER]: 'undefined' }), HEADER, '')).toBe(false);
    });
  });
});
