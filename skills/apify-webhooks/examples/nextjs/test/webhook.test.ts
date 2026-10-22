import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/apify/route';
import { verifyApifyRequest } from '../lib/verify-apify';

const SECRET = 'test_apify_secret_0123456789';
const HEADER = 'X-Webhook-Secret';

const EVENTS = [
  'ACTOR.RUN.CREATED', 'ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED',
  'ACTOR.RUN.ABORTED', 'ACTOR.RUN.TIMED_OUT', 'ACTOR.RUN.RESURRECTED',
  'ACTOR.BUILD.CREATED', 'ACTOR.BUILD.SUCCEEDED', 'ACTOR.BUILD.FAILED',
  'ACTOR.BUILD.ABORTED', 'ACTOR.BUILD.TIMED_OUT',
];

beforeAll(() => {
  process.env.APIFY_WEBHOOK_SECRET = SECRET;
  delete process.env.APIFY_WEBHOOK_HEADER; // default: X-Webhook-Secret
});

afterEach(() => {
  delete process.env.APIFY_WEBHOOK_HEADER;
});

function samplePayload(eventType = 'ACTOR.RUN.SUCCEEDED') {
  const isBuild = eventType.startsWith('ACTOR.BUILD');
  return {
    userId: 'abf6vtB2nvQZ4nJzo',
    createdAt: '2019-01-09T15:59:56.408Z',
    eventType,
    eventData: isBuild
      ? { actorId: 'fW4MyDhgwtMLrB987', actorBuildId: 'HG7ML7M8z78YcAPEB' }
      : { actorId: 'fW4MyDhgwtMLrB987', actorRunId: 'uPBN9qaKd2iLs5naZ' },
    resource: { id: 'uPBN9qaKd2iLs5naZ', status: 'SUCCEEDED' },
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  url = 'http://localhost:3000/webhooks/apify'
): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('POST /webhooks/apify', () => {
  describe('secret header verification', () => {
    it('accepts the correct secret', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ 'x-webhook-secret': SECRET }));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong secret of the same length', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a secret of a different length without throwing', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('does not accept the system headers as credentials', async () => {
      const res = await POST(
        makeRequest({ 'X-Apify-Webhook': SECRET, 'X-Apify-Webhook-Dispatch-Id': SECRET })
      );
      expect(res.status).toBe(401);
    });

    it('does not accept the secret in the URL', async () => {
      const res = await POST(
        makeRequest({}, JSON.stringify(samplePayload()), `http://localhost:3000/webhooks/apify?token=${SECRET}`)
      );
      expect(res.status).toBe(401);
    });

    it('does not throw on non-ASCII input', () => {
      const headers = new Headers({ [HEADER]: 'sécret-ü' });
      expect(verifyApifyRequest(headers, SECRET)).toBe(false);
      expect(verifyApifyRequest(headers, 'sécret-ü')).toBe(true);
    });

    it('rejects everything when no secret is configured', () => {
      const headers = new Headers({ [HEADER]: SECRET });
      expect(verifyApifyRequest(headers, '')).toBe(false);
      expect(verifyApifyRequest(headers, SECRET)).toBe(true);
    });
  });

  describe('configurable header name', () => {
    it('reads the header name from APIFY_WEBHOOK_HEADER', async () => {
      process.env.APIFY_WEBHOOK_HEADER = 'X-Apify-Auth';
      expect((await POST(makeRequest({ 'x-apify-auth': SECRET }))).status).toBe(200);
      expect((await POST(makeRequest({ [HEADER]: SECRET }))).status).toBe(401);
    });

    it('compares the whole value, including a Bearer prefix', () => {
      process.env.APIFY_WEBHOOK_HEADER = 'Authorization';
      const secret = `Bearer ${SECRET}`;
      expect(verifyApifyRequest(new Headers({ authorization: secret }), secret)).toBe(true);
      // The prefix is not stripped: the bare token does not match "Bearer <token>"
      expect(verifyApifyRequest(new Headers({ authorization: SECRET }), secret)).toBe(false);
      expect(verifyApifyRequest(new Headers({ authorization: secret }), SECRET)).toBe(false);
    });
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const req = new NextRequest('http://localhost:3000/webhooks/apify', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', [HEADER]: SECRET },
        body: JSON.stringify(samplePayload()),
      });
      expect((await POST(req)).status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('event handling', () => {
    it.each(EVENTS)('handles %s', async (eventType) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload(eventType))));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload('ACTOR.SOMETHING.NEW')))
      );
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    it('handles a payload without eventData', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify({ eventType: 'ACTOR.RUN.FAILED' })));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });
});
