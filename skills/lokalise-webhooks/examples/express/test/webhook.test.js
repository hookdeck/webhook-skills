const request = require('supertest');

// Set test environment variables before importing the app
process.env.LOKALISE_WEBHOOK_SECRET = 'test_lokalise_secret_7d32ea041f77c0b9';
process.env.LOKALISE_WEBHOOK_HEADER = 'X-Secret';

const app = require('../src/index');
const { verifyLokaliseRequest } = require('../src/index');

const SECRET = process.env.LOKALISE_WEBHOOK_SECRET;

// Shapes follow https://developers.lokalise.com/docs/webhook-events
const project = { id: '138c1ffa0ad94848f01f980e7f2f2af19d1bd553', name: 'TheApp Project', branch: 'master' };
const user = { email: 'john@example.com', full_name: 'John Doe' };

const payloads = {
  'project.translation.updated': {
    event: 'project.translation.updated',
    translation: { id: 84835169, value: 'Hello, %s!', previous_value: 'Hi!', segment: 1 },
    language: { id: 640, iso: 'en', name: 'English' },
    key: { id: 16307701, name: 'test.title' },
    project, user,
    created_at: '2019-07-29 12:18:31', created_at_timestamp: 1564395511
  },
  'project.translations.updated': {
    event: 'project.translations.updated', action: 'bulk.tm',
    translations: [{ id: 84825168, value: 'Bonjour!', previous_value: '' }],
    project, user
  },
  'project.key.added': {
    event: 'project.key.added', key: { id: 16307699, name: 'test.title', base_value: 'Hello, world!' }, project, user
  },
  'project.keys.added': {
    event: 'project.keys.added', action: 'lokalise',
    keys: [{ id: 28707699, name: 'test.title', base_value: 'Hello, world!' }], project, user
  },
  'project.key.modified': {
    event: 'project.key.modified', key: { id: 16307699, name: 'test.title' }, project, user
  },
  'project.keys.modified': {
    event: 'project.keys.modified', keys: [{ id: 16307699, name: 'test.title' }], project, user
  },
  'project.keys.deleted': {
    event: 'project.keys.deleted', keys: [{ id: 16307699, name: 'test.title' }], project, user
  },
  'project.task.closed': {
    event: 'project.task.closed',
    task: { id: 5022, type: 'translation', title: 'Headings translation' },
    project, user
  },
  'project.imported': { event: 'project.imported', project, user }
};

function post(body = JSON.stringify(payloads['project.translation.updated'])) {
  return request(app)
    .post('/webhooks/lokalise')
    .set('Content-Type', 'application/json')
    .send(body);
}

describe('Lokalise webhook endpoint', () => {
  describe('secret header verification', () => {
    it('accepts the correct X-Secret', async () => {
      const res = await post().set('X-Secret', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('x-secret', SECRET);
      expect(res.status).toBe(200);
    });

    it('rejects a wrong secret of the same length', async () => {
      const res = await post().set('X-Secret', 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a secret of a different length without throwing', async () => {
      const res = await post().set('X-Secret', 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing secret header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('does not accept the secret in an unconfigured header', async () => {
      const res = await post().set('X-Api-Key', SECRET);
      expect(res.status).toBe(401);
    });

    it('rejects everything when no secret is configured', () => {
      expect(verifyLokaliseRequest({ 'x-secret': '' }, {})).toBe(false);
      expect(verifyLokaliseRequest({ 'x-secret': 'anything' }, {})).toBe(false);
    });

    it('supports X-Api-Key via LOKALISE_WEBHOOK_HEADER', () => {
      const config = { LOKALISE_WEBHOOK_SECRET: SECRET, LOKALISE_WEBHOOK_HEADER: 'X-Api-Key' };
      expect(verifyLokaliseRequest({ 'x-api-key': SECRET }, config)).toBe(true);
      expect(verifyLokaliseRequest({ 'x-secret': SECRET }, config)).toBe(false);
    });

    it('supports a custom header name', () => {
      const config = { LOKALISE_WEBHOOK_SECRET: SECRET, LOKALISE_WEBHOOK_HEADER: 'X-My-Lokalise' };
      expect(verifyLokaliseRequest({ 'x-my-lokalise': SECRET }, config)).toBe(true);
    });
  });

  describe('event handling', () => {
    for (const event of Object.keys(payloads)) {
      it(`handles ${event}`, async () => {
        const res = await post(JSON.stringify(payloads[event])).set('X-Secret', SECRET);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ received: true });
      });
    }

    it('acknowledges unknown events', async () => {
      const res = await post(JSON.stringify({ event: 'project.something.new' })).set('X-Secret', SECRET);
      expect(res.status).toBe(200);
    });

    it('verifies any content type (raw body)', async () => {
      const res = await request(app)
        .post('/webhooks/lokalise')
        .set('Content-Type', 'text/plain')
        .set('X-Secret', SECRET)
        .send(JSON.stringify(payloads['project.keys.added']));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });
  });

  describe('ping on setup', () => {
    it('returns 2xx for an authenticated empty ping', async () => {
      const res = await request(app).post('/webhooks/lokalise').set('X-Secret', SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 2xx for an authenticated non-JSON ping', async () => {
      const res = await post('ping').set('X-Secret', SECRET);
      expect(res.status).toBe(200);
      expect(res.body.ignored).toBe(true);
    });

    it('still rejects an unauthenticated ping', async () => {
      const res = await request(app).post('/webhooks/lokalise');
      expect(res.status).toBe(401);
    });
  });
});
