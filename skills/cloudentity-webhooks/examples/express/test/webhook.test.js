const request = require('supertest');

// Set test environment variables before importing the app
process.env.CLOUDENTITY_WEBHOOK_API_KEY = 'test_cloudentity_api_key_0123456789';

const app = require('../src/index');
const { verifyCloudentityRequest } = require('../src/index');

const KEY = process.env.CLOUDENTITY_WEBHOOK_API_KEY;

const EVENTS = [
  'user.created', 'user.updated', 'user.deleted', 'user.authenticated',
  'group.created', 'login.failed', 'consent.revoked', 'client.created',
];

// Inferred shape: the event's subject_action name is the one key of `payload`.
function batch(...types) {
  return {
    audit_events: types.map((type, i) => ({
      tenant_id: 'example',
      server_id: 'demo',
      event_id: `evt_${i}`,
      payload: { [type.replace(/\./g, '_')]: {} },
    })),
  };
}

function post(body = JSON.stringify(batch('user.created')), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/cloudentity')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Cloudentity webhook endpoint', () => {
  describe('X-API-Key verification', () => {
    it('accepts the correct key', async () => {
      const res = await post().set('X-API-Key', KEY);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('x-api-key', KEY);
      expect(res.status).toBe(200);
    });

    it('rejects a wrong key of the same length', async () => {
      const res = await post().set('X-API-Key', 'x'.repeat(KEY.length));
      expect(res.status).toBe(401);
    });

    it('rejects a key of a different length without throwing', async () => {
      const res = await post().set('X-API-Key', 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a key with extra characters (whole value is compared)', async () => {
      const res = await post().set('X-API-Key', `x${KEY}`);
      expect(res.status).toBe(401);
    });

    it('rejects a missing key', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('does not accept the key in the Authorization header', async () => {
      const res = await post().set('Authorization', `Bearer ${KEY}`);
      expect(res.status).toBe(401);
    });

    it('rejects everything when CLOUDENTITY_WEBHOOK_API_KEY is unset', () => {
      expect(verifyCloudentityRequest({ 'x-api-key': KEY }, '')).toBe(false);
      delete process.env.CLOUDENTITY_WEBHOOK_API_KEY;
      expect(verifyCloudentityRequest({ 'x-api-key': KEY })).toBe(false);
      process.env.CLOUDENTITY_WEBHOOK_API_KEY = KEY;
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(batch('user.created')), 'text/plain')
        .set('X-API-Key', KEY);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set('X-API-Key', KEY);
      expect(res.status).toBe(400);
    });

    it('returns 400 when audit_events is missing', async () => {
      const res = await post('{"hello":"world"}').set('X-API-Key', KEY);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without a key', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (type) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(batch(type))).set('X-API-Key', KEY);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges an event whose payload has no recognisable key', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const body = { audit_events: [{ tenant_id: 'example', server_id: 'demo', event_id: 'evt_0' }] };
      const res = await post(JSON.stringify(body)).set('X-API-Key', KEY);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(true);
      spy.mockRestore();
    });

    it('handles a batch of several events', async () => {
      const res = await post(JSON.stringify(batch('user.created', 'user.authenticated', 'group.created')))
        .set('X-API-Key', KEY);
      expect(res.status).toBe(200);
    });

    it('acknowledges unknown events', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(batch('something.new'))).set('X-API-Key', KEY);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
