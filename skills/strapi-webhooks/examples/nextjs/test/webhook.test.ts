import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/strapi/route';
import { verifyStrapiRequest } from '../lib/verify-strapi';

const SECRET = 'Bearer test_strapi_secret_0123456789';

const EVENTS = [
  'entry.create', 'entry.update', 'entry.delete', 'entry.publish', 'entry.unpublish',
  'entry.draft-discard', 'media.create', 'media.update', 'media.delete',
  'review-workflows.updateEntryStage', 'releases.publish',
];

beforeAll(() => {
  process.env.STRAPI_WEBHOOK_SECRET = SECRET;
  delete process.env.STRAPI_WEBHOOK_HEADER; // default: Authorization
});

function samplePayload(event = 'entry.create'): Record<string, unknown> {
  if (event.startsWith('media.')) {
    return { event, createdAt: '2026-09-09T09:03:55.238Z', media: { id: 1, name: 'photo.png', url: '/uploads/photo.png' } };
  }
  if (event === 'review-workflows.updateEntryStage') {
    return {
      event, createdAt: '2023-06-26T15:46:35.664Z', model: 'model', uid: 'uid', entity: { id: 2 },
      workflow: { id: 1, stages: { from: { id: 1, name: 'Stage 1' }, to: { id: 2, name: 'Stage 2' } } },
    };
  }
  if (event === 'releases.publish') {
    return { event, createdAt: '2024-02-21T16:45:36.877Z', isPublished: true, release: { id: 2, name: 'Fall Winter highlights' } };
  }
  return {
    event,
    createdAt: '2026-09-09T08:49:26.158Z',
    model: 'address',
    uid: 'api::address.address',
    entry: { id: 1, documentId: 'w7vfs319acmaxnurjk5vaaza', city: 'Paris', publishedAt: null },
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/strapi', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/strapi', () => {
  describe('header credential verification (default Authorization header)', () => {
    it('accepts the exact header value, Bearer prefix included', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ authorization: SECRET }));
      expect(res.status).toBe(200);
    });

    it('rejects the bare token without the Bearer prefix (whole value is compared)', async () => {
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

    it('rejects everything when STRAPI_WEBHOOK_SECRET is unset', () => {
      const headers = new Headers({ Authorization: SECRET });
      expect(verifyStrapiRequest(headers, '')).toBe(false);
      delete process.env.STRAPI_WEBHOOK_SECRET;
      expect(verifyStrapiRequest(headers)).toBe(false);
      process.env.STRAPI_WEBHOOK_SECRET = SECRET;
    });
  });

  describe('custom header name (STRAPI_WEBHOOK_HEADER)', () => {
    afterEach(() => {
      delete process.env.STRAPI_WEBHOOK_HEADER;
    });

    it('reads the credential from the configured header', async () => {
      process.env.STRAPI_WEBHOOK_HEADER = 'X-Strapi-Secret';
      const ok = await POST(makeRequest({ 'x-strapi-secret': SECRET }));
      expect(ok.status).toBe(200);
      const wrongHeader = await POST(makeRequest({ Authorization: SECRET }));
      expect(wrongHeader.status).toBe(401);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await POST(
        makeRequest({ Authorization: SECRET }, JSON.stringify(samplePayload()), 'text/plain')
      );
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without a credential', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (event) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ Authorization: SECRET }, JSON.stringify(samplePayload(event))));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('falls back to the X-Strapi-Event header when the body has no event', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest(
          { Authorization: SECRET, 'X-Strapi-Event': 'entry.publish' },
          JSON.stringify({ model: 'address', entry: { documentId: 'abc' } })
        )
      );
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Entry published'))).toBe(true);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ Authorization: SECRET }, JSON.stringify(samplePayload('something.new'))));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });
});
