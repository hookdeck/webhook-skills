const request = require('supertest');

// Set test environment variables before importing the app
process.env.STRAPI_WEBHOOK_SECRET = 'Bearer test_strapi_secret_0123456789';
delete process.env.STRAPI_WEBHOOK_HEADER; // default: Authorization

const app = require('../src/index');
const { verifyStrapiRequest } = require('../src/index');

const SECRET = process.env.STRAPI_WEBHOOK_SECRET;

const EVENTS = [
  'entry.create', 'entry.update', 'entry.delete', 'entry.publish', 'entry.unpublish',
  'entry.draft-discard', 'media.create', 'media.update', 'media.delete',
  'review-workflows.updateEntryStage', 'releases.publish'
];

function samplePayload(event = 'entry.create') {
  if (event.startsWith('media.')) {
    return { event, createdAt: '2026-09-09T09:03:55.238Z', media: { id: 1, name: 'photo.png', url: '/uploads/photo.png' } };
  }
  if (event === 'review-workflows.updateEntryStage') {
    return {
      event, createdAt: '2023-06-26T15:46:35.664Z', model: 'model', uid: 'uid', entity: { id: 2 },
      workflow: { id: 1, stages: { from: { id: 1, name: 'Stage 1' }, to: { id: 2, name: 'Stage 2' } } }
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
    entry: { id: 1, documentId: 'w7vfs319acmaxnurjk5vaaza', city: 'Paris', publishedAt: null }
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/strapi')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Strapi webhook endpoint', () => {
  describe('header credential verification (default Authorization header)', () => {
    it('accepts the exact header value, Bearer prefix included', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('rejects the bare token without the Bearer prefix (whole value is compared)', async () => {
      const res = await post().set('Authorization', SECRET.replace('Bearer ', ''));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await post().set('Authorization', 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await post().set('Authorization', 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects everything when STRAPI_WEBHOOK_SECRET is unset', () => {
      expect(verifyStrapiRequest({ authorization: SECRET }, '')).toBe(false);
      delete process.env.STRAPI_WEBHOOK_SECRET;
      expect(verifyStrapiRequest({ authorization: SECRET })).toBe(false);
      process.env.STRAPI_WEBHOOK_SECRET = SECRET;
    });
  });

  describe('custom header name (STRAPI_WEBHOOK_HEADER)', () => {
    afterEach(() => {
      delete process.env.STRAPI_WEBHOOK_HEADER;
    });

    it('reads the credential from the configured header', async () => {
      process.env.STRAPI_WEBHOOK_HEADER = 'X-Strapi-Secret';
      const ok = await post().set('x-strapi-secret', SECRET);
      expect(ok.status).toBe(200);
      const wrongHeader = await post().set('Authorization', SECRET);
      expect(wrongHeader.status).toBe(401);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await post('[1,2]').set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without a credential', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (event) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload(event))).set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('falls back to the X-Strapi-Event header when the body has no event', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify({ model: 'address', entry: { documentId: 'abc' } }))
        .set('Authorization', SECRET)
        .set('X-Strapi-Event', 'entry.publish');
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Entry published'))).toBe(true);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload('something.new'))).set('Authorization', SECRET);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
