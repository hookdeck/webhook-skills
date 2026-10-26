const request = require('supertest');

// Set test environment variables before importing the app
process.env.NEXTCLOUD_WEBHOOK_HEADER = 'Authorization';
process.env.NEXTCLOUD_WEBHOOK_SECRET = 'Bearer test_nextcloud_secret_0123456789';

const app = require('../src/index');
const { verifyNextcloudRequest } = require('../src/index');

const HEADER = process.env.NEXTCLOUD_WEBHOOK_HEADER;
const SECRET = process.env.NEXTCLOUD_WEBHOOK_SECRET;

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

function samplePayload(cls = 'OCP\\Files\\Events\\Node\\NodeCreatedEvent') {
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

function send(method, body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  const req = request(app)[method.toLowerCase()]('/webhooks/nextcloud');
  if (body !== null) req.set('Content-Type', contentType).send(body);
  return req;
}

const post = (body, contentType) => send('POST', body, contentType);

describe('Nextcloud webhook endpoint', () => {
  describe('secret header verification', () => {
    it('accepts the correct whole header value', async () => {
      const res = await post().set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('compares the WHOLE value: the bare token without "Bearer " is rejected', async () => {
      const res = await post().set(HEADER, 'test_nextcloud_secret_0123456789');
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await post().set(HEADER, 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await post().set(HEADER, 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects a non-ASCII value without throwing', () => {
      expect(verifyNextcloudRequest({ authorization: 'Bearer café' })).toBe(false);
      expect(verifyNextcloudRequest({ authorization: 'café' }, 'café')).toBe(true);
    });

    it('rejects everything when NEXTCLOUD_WEBHOOK_SECRET is unset', () => {
      expect(verifyNextcloudRequest({ authorization: SECRET }, '')).toBe(false);
      delete process.env.NEXTCLOUD_WEBHOOK_SECRET;
      expect(verifyNextcloudRequest({ authorization: SECRET })).toBe(false);
      process.env.NEXTCLOUD_WEBHOOK_SECRET = SECRET;
    });

    it('reads a custom header name from NEXTCLOUD_WEBHOOK_HEADER', async () => {
      process.env.NEXTCLOUD_WEBHOOK_HEADER = 'X-Nextcloud-Secret';
      try {
        expect((await post().set('X-Nextcloud-Secret', SECRET)).status).toBe(200);
        expect((await post().set('Authorization', SECRET)).status).toBe(401);
      } finally {
        process.env.NEXTCLOUD_WEBHOOK_HEADER = HEADER;
      }
    });

    it('defaults the header name to Authorization', () => {
      delete process.env.NEXTCLOUD_WEBHOOK_HEADER;
      try {
        expect(verifyNextcloudRequest({ authorization: SECRET })).toBe(true);
      } finally {
        process.env.NEXTCLOUD_WEBHOOK_HEADER = HEADER;
      }
    });
  });

  describe('HTTP methods', () => {
    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('accepts %s with a body', async (method) => {
      const res = await send(method).set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts GET with no body', async () => {
      const res = await send('GET', null).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it.each(['POST', 'PUT', 'PATCH', 'GET', 'DELETE'])('rejects %s without the credential', async (method) => {
      const res = await send(method, method === 'GET' ? null : undefined);
      expect(res.status).toBe(401);
    });

    it('returns 405 for other methods', async () => {
      const res = await request(app).options('/webhooks/nextcloud');
      expect(res.status).toBe(405);
      expect(res.headers.allow).toBe('POST, PUT, PATCH, GET, DELETE');
    });
  });

  describe('body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('acknowledges an empty body', async () => {
      const res = await post('').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await post('[1,2]').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the credential', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('event handling', () => {
    it.each(EVENTS)('handles %s', async (cls) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload(cls))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('handles a NodeDeletedEvent whose node has no id', async () => {
      const body = { event: { class: EVENTS[3], node: { path: '/user/files/old.txt' } }, user: null, time: 1 };
      const res = await post(JSON.stringify(body)).set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('acknowledges unknown events', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload('OCA\\Mail\\Event\\NewMessageReceivedEvent'))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
