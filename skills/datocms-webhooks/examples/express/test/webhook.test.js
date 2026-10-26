const crypto = require('crypto');
const request = require('supertest');

// Set test environment variables before importing the app
process.env.DATOCMS_WEBHOOK_USERNAME = 'datocms-user';
process.env.DATOCMS_WEBHOOK_PASSWORD = 'p@ss:word:with:colons-0123456789';

const app = require('../src/index');
const { verifyDatoCmsRequest } = require('../src/index');

const USER = process.env.DATOCMS_WEBHOOK_USERNAME;
const PASS = process.env.DATOCMS_WEBHOOK_PASSWORD;

const basic = (user, pass, scheme = 'Basic') =>
  `${scheme} ${Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')}`;
const GOOD = basic(USER, PASS);

const EVENTS = [
  ['item', 'create'], ['item', 'update'], ['item', 'delete'], ['item', 'publish'],
  ['item', 'unpublish'], ['item_type', 'create'], ['item_type', 'update'],
  ['item_type', 'delete'], ['upload', 'create'], ['upload', 'update'], ['upload', 'delete'],
  ['build_trigger', 'deploy_started'], ['build_trigger', 'deploy_succeeded'],
  ['build_trigger', 'deploy_failed'], ['environment', 'deploy_started'],
  ['environment', 'deploy_succeeded'], ['environment', 'deploy_failed'],
  ['maintenance_mode', 'change'], ['sso_user', 'create'], ['cda_cache_tags', 'invalidate']
];

function samplePayload(entityType = 'item', eventType = 'publish') {
  return {
    environment: 'main',
    entity_type: entityType,
    event_type: eventType,
    entity: { id: '39830648', type: entityType, attributes: { name: 'Mark Smith' } },
    related_entities: []
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/datocms')
    .set('Content-Type', contentType)
    .send(body);
}

describe('DatoCMS webhook endpoint', () => {
  describe('HTTP Basic authentication', () => {
    it('accepts the correct credentials', async () => {
      const res = await post().set('Authorization', GOOD);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('accepts a case-insensitive scheme', async () => {
      const res = await post().set('Authorization', basic(USER, PASS, 'basic'));
      expect(res.status).toBe(200);
    });

    it('accepts a password containing colons (split on the first colon)', async () => {
      expect(PASS.includes(':')).toBe(true);
      const res = await post().set('Authorization', GOOD);
      expect(res.status).toBe(200);
    });

    it('rejects a wrong username', async () => {
      const res = await post().set('Authorization', basic('someone-else', PASS));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong password of the same length', async () => {
      const res = await post().set('Authorization', basic(USER, 'x'.repeat(PASS.length)));
      expect(res.status).toBe(401);
    });

    it('rejects credentials of a different length without throwing', async () => {
      const res = await post().set('Authorization', basic('u', 'p'));
      expect(res.status).toBe(401);
    });

    it('rejects when both are wrong', async () => {
      const res = await post().set('Authorization', basic('nope', 'nope'));
      expect(res.status).toBe(401);
    });

    it('rejects a missing Authorization header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects a Bearer scheme', async () => {
      const res = await post().set('Authorization', `Bearer ${PASS}`);
      expect(res.status).toBe(401);
    });

    it('rejects malformed base64', async () => {
      const res = await post().set('Authorization', 'Basic !!!not-base64!!!');
      expect(res.status).toBe(401);
    });

    it('rejects a payload with no colon', async () => {
      const res = await post().set('Authorization', `Basic ${Buffer.from('nocolon').toString('base64')}`);
      expect(res.status).toBe(401);
    });

    it('handles non-ASCII credentials', async () => {
      expect(verifyDatoCmsRequest({ authorization: basic('üser', 'pässwörd-✓') }, 'üser', 'pässwörd-✓')).toBe(true);
      expect(verifyDatoCmsRequest({ authorization: basic('üser', 'pässwörd-✗') }, 'üser', 'pässwörd-✓')).toBe(false);
    });

    it('evaluates both comparisons even when the username is wrong', () => {
      const spy = jest.spyOn(crypto, 'timingSafeEqual');
      expect(verifyDatoCmsRequest({ authorization: basic('wrong', PASS) }, USER, PASS)).toBe(false);
      expect(spy).toHaveBeenCalledTimes(2);
      spy.mockRestore();
    });

    it('rejects everything when credentials are not configured', () => {
      expect(verifyDatoCmsRequest({ authorization: GOOD }, '', '')).toBe(false);
      expect(verifyDatoCmsRequest({ authorization: basic('', '') }, '', '')).toBe(false);
      delete process.env.DATOCMS_WEBHOOK_USERNAME;
      expect(verifyDatoCmsRequest({ authorization: GOOD })).toBe(false);
      process.env.DATOCMS_WEBHOOK_USERNAME = USER;
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain')
        .set('Authorization', GOOD);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set('Authorization', GOOD);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await post('[1,2]').set('Authorization', GOOD);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without credentials', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s %s', async (entityType, eventType) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload(entityType, eventType)))
        .set('Authorization', GOOD);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges custom payloads without entity_type or event_type', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify({ message: 'publish event triggered on item!' }))
        .set('Authorization', GOOD);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
