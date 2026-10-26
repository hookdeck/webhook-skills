import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, PUT, PATCH, GET, DELETE } from '../app/webhooks/nextcloud/route';
import { verifyNextcloudRequest } from '../lib/verify-nextcloud';

const HEADER = 'Authorization';
const SECRET = 'Bearer test_nextcloud_secret_0123456789';

const EVENTS = [
  'OCP\\Files\\Events\\Node\\NodeCreatedEvent',
  'OCP\\Files\\Events\\Node\\NodeWrittenEvent',
  'OCP\\Files\\Events\\Node\\NodeTouchedEvent',
  'OCP\\Files\\Events\\Node\\NodeDeletedEvent',
  'OCP\\Files\\Events\\Node\\NodeCopiedEvent',
  'OCP\\Files\\Events\\Node\\NodeRenamedEvent',
  'OCP\\Files\\Events\\Node\\NodeRestoredEvent',
  'OCP\\SystemTag\\TagAssignedEvent',
  'OCP\\SystemTag\\TagUnassignedEvent',
  'OCP\\Calendar\\Events\\CalendarObjectCreatedEvent',
  'OCP\\Calendar\\Events\\CalendarObjectUpdatedEvent',
  'OCP\\Calendar\\Events\\CalendarObjectDeletedEvent',
  'OCA\\Forms\\Events\\FormSubmittedEvent',
];

beforeAll(() => {
  process.env.NEXTCLOUD_WEBHOOK_HEADER = HEADER;
  process.env.NEXTCLOUD_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  process.env.NEXTCLOUD_WEBHOOK_HEADER = HEADER;
  process.env.NEXTCLOUD_WEBHOOK_SECRET = SECRET;
  vi.restoreAllMocks();
});

function samplePayload(cls = EVENTS[0]) {
  return {
    event: {
      class: cls,
      node: { id: 437, path: '/admin/files/test-webhook.txt' },
      source: { id: 399, path: '/admin/files/a.txt' },
      target: { id: 437, path: '/admin/files/b.txt' },
      calendarId: 1,
    },
    user: { uid: 'admin', displayName: 'Admin' },
    time: 1700100000,
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string | null = JSON.stringify(samplePayload()),
  method = 'POST'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/nextcloud', {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(body === null ? {} : { body }),
  });
}

describe('/webhooks/nextcloud', () => {
  describe('secret header verification', () => {
    it('accepts the correct whole header value', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ authorization: SECRET }));
      expect(res.status).toBe(200);
    });

    it('compares the WHOLE value: the bare token without "Bearer " is rejected', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'test_nextcloud_secret_0123456789' }));
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

    it('handles non-ASCII values without throwing', () => {
      const headers = new Headers({ authorization: 'café' });
      expect(verifyNextcloudRequest(headers, 'Bearer café')).toBe(false);
      expect(verifyNextcloudRequest(headers, 'café')).toBe(true);
    });

    it('rejects everything when no secret is configured', () => {
      const headers = new Headers({ authorization: SECRET });
      expect(verifyNextcloudRequest(headers, '')).toBe(false);
      expect(verifyNextcloudRequest(headers, SECRET)).toBe(true);
      delete process.env.NEXTCLOUD_WEBHOOK_SECRET;
      expect(verifyNextcloudRequest(headers)).toBe(false);
    });

    it('reads a custom header name from NEXTCLOUD_WEBHOOK_HEADER', async () => {
      process.env.NEXTCLOUD_WEBHOOK_HEADER = 'X-Nextcloud-Secret';
      expect((await POST(makeRequest({ 'X-Nextcloud-Secret': SECRET }))).status).toBe(200);
      expect((await POST(makeRequest({ Authorization: SECRET }))).status).toBe(401);
    });

    it('defaults the header name to Authorization', () => {
      delete process.env.NEXTCLOUD_WEBHOOK_HEADER;
      expect(verifyNextcloudRequest(new Headers({ authorization: SECRET }))).toBe(true);
    });
  });

  describe('HTTP methods', () => {
    const handlers = { POST, PUT, PATCH, DELETE };

    it.each(Object.entries(handlers))('accepts %s with a body', async (method, handler) => {
      const res = await handler(makeRequest({ [HEADER]: SECRET }, undefined, method));
      expect(res.status).toBe(200);
    });

    it('accepts GET with no body', async () => {
      const res = await GET(makeRequest({ [HEADER]: SECRET }, null, 'GET'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('rejects GET without the credential', async () => {
      const res = await GET(makeRequest({}, null, 'GET'));
      expect(res.status).toBe(401);
    });
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const req = new NextRequest('http://localhost:3000/webhooks/nextcloud', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', authorization: SECRET },
        body: JSON.stringify(samplePayload()),
      });
      expect((await POST(req)).status).toBe(200);
    });

    it('acknowledges an empty body', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, ''));
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the credential', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('event handling', () => {
    it.each(EVENTS)('handles %s', async (cls) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload(cls))));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
    });

    it('handles a NodeDeletedEvent whose node has no id and a null user', async () => {
      const body = { event: { class: EVENTS[3], node: { path: '/user/files/old.txt' } }, user: null, time: 1 };
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(body)));
      expect(res.status).toBe(200);
    });

    it('acknowledges unknown events', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload('OCA\\Mail\\Event\\NewMessageReceivedEvent')))
      );
      expect(res.status).toBe(200);
    });
  });
});
