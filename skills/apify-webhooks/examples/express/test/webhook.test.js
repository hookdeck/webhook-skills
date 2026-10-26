const request = require('supertest');

// Set test environment variables before importing the app
process.env.APIFY_WEBHOOK_SECRET = 'test_apify_secret_0123456789';
delete process.env.APIFY_WEBHOOK_HEADER; // default: X-Webhook-Secret

const app = require('../src/index');
const { verifyApifyRequest } = require('../src/index');

const SECRET = process.env.APIFY_WEBHOOK_SECRET;
const HEADER = 'X-Webhook-Secret';

const RUN_EVENTS = [
  'ACTOR.RUN.CREATED', 'ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED',
  'ACTOR.RUN.ABORTED', 'ACTOR.RUN.TIMED_OUT', 'ACTOR.RUN.RESURRECTED'
];
const BUILD_EVENTS = [
  'ACTOR.BUILD.CREATED', 'ACTOR.BUILD.SUCCEEDED', 'ACTOR.BUILD.FAILED',
  'ACTOR.BUILD.ABORTED', 'ACTOR.BUILD.TIMED_OUT'
];

function samplePayload(eventType = 'ACTOR.RUN.SUCCEEDED') {
  const isBuild = eventType.startsWith('ACTOR.BUILD');
  return {
    userId: 'abf6vtB2nvQZ4nJzo',
    createdAt: '2019-01-09T15:59:56.408Z',
    eventType,
    eventData: isBuild
      ? { actorId: 'fW4MyDhgwtMLrB987', actorBuildId: 'HG7ML7M8z78YcAPEB' }
      : { actorId: 'fW4MyDhgwtMLrB987', actorRunId: 'uPBN9qaKd2iLs5naZ' },
    resource: { id: 'uPBN9qaKd2iLs5naZ', status: 'SUCCEEDED' }
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/apify')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Apify webhook endpoint', () => {
  describe('secret header verification', () => {
    it('accepts the correct secret', async () => {
      const res = await post().set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('x-webhook-secret', SECRET);
      expect(res.status).toBe(200);
    });

    it('rejects a wrong secret of the same length', async () => {
      const res = await post().set(HEADER, 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a secret of a different length without throwing', async () => {
      const res = await post().set(HEADER, 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('does not accept the system headers as credentials', async () => {
      const res = await post()
        .set('X-Apify-Webhook', SECRET)
        .set('X-Apify-Webhook-Dispatch-Id', SECRET);
      expect(res.status).toBe(401);
    });

    it('does not accept the secret in the URL', async () => {
      const res = await request(app)
        .post(`/webhooks/apify?token=${SECRET}`)
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(samplePayload()));
      expect(res.status).toBe(401);
    });

    it('does not throw on non-ASCII input', () => {
      expect(verifyApifyRequest({ 'x-webhook-secret': 'sécret-ü' }, SECRET)).toBe(false);
      expect(verifyApifyRequest({ 'x-webhook-secret': 'sécret-ü' }, 'sécret-ü')).toBe(true);
    });

    it('rejects everything when APIFY_WEBHOOK_SECRET is unset', () => {
      expect(verifyApifyRequest({ 'x-webhook-secret': SECRET }, '')).toBe(false);
      delete process.env.APIFY_WEBHOOK_SECRET;
      expect(verifyApifyRequest({ 'x-webhook-secret': SECRET })).toBe(false);
      process.env.APIFY_WEBHOOK_SECRET = SECRET;
    });
  });

  describe('configurable header name', () => {
    afterEach(() => {
      delete process.env.APIFY_WEBHOOK_HEADER;
    });

    it('reads the header name from APIFY_WEBHOOK_HEADER', async () => {
      process.env.APIFY_WEBHOOK_HEADER = 'X-Apify-Auth';
      expect((await post().set('x-apify-auth', SECRET)).status).toBe(200);
      expect((await post().set(HEADER, SECRET)).status).toBe(401);
    });

    it('compares the whole value, including a Bearer prefix', async () => {
      process.env.APIFY_WEBHOOK_HEADER = 'Authorization';
      const secret = `Bearer ${SECRET}`;
      expect(verifyApifyRequest({ authorization: secret }, secret)).toBe(true);
      // The prefix is not stripped: the bare token does not match "Bearer <token>"
      expect(verifyApifyRequest({ authorization: SECRET }, secret)).toBe(false);
      expect(verifyApifyRequest({ authorization: secret }, SECRET)).toBe(false);
    });
  });

  describe('body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set(HEADER, SECRET);
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

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('event handling', () => {
    it.each([...RUN_EVENTS, ...BUILD_EVENTS])('handles %s', async (eventType) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload(eventType))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload('ACTOR.SOMETHING.NEW'))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    it('handles a payload without eventData', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify({ eventType: 'ACTOR.RUN.FAILED' })).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
