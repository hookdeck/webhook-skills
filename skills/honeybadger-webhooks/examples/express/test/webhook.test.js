const request = require('supertest');

// Set test environment variables before importing the app
process.env.HONEYBADGER_TOKEN = 'test_honeybadger_token_0123456789';

const app = require('../src/index');
const { verifyHoneybadgerRequest } = require('../src/index');

const TOKEN = process.env.HONEYBADGER_TOKEN;

const EVENTS = [
  'occurred', 'resolved', 'unresolved', 'assigned', 'commented', 'rate_exceeded',
  'volume_spike', 'deployed', 'down', 'up', 'cert_will_expire', 'check_in_missing',
  'check_in_reporting'
];

function samplePayload(event = 'occurred') {
  return {
    event,
    message: '[Crywolf/test] RuntimeError - oops',
    fault: { id: 3151009, project_id: 1717, klass: 'RuntimeError', environment: 'development' }
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/honeybadger')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Honeybadger webhook endpoint', () => {
  describe('Honeybadger-Token verification', () => {
    it('accepts the correct token', async () => {
      const res = await post().set('Honeybadger-Token', TOKEN);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('honeybadger-token', TOKEN);
      expect(res.status).toBe(200);
    });

    it('rejects a wrong token of the same length', async () => {
      const res = await post().set('Honeybadger-Token', 'x'.repeat(TOKEN.length));
      expect(res.status).toBe(401);
    });

    it('rejects a token of a different length without throwing', async () => {
      const res = await post().set('Honeybadger-Token', 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing token', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('does not accept the token as an Authorization bearer', async () => {
      const res = await post().set('Authorization', `Bearer ${TOKEN}`);
      expect(res.status).toBe(401);
    });

    it('rejects everything when HONEYBADGER_TOKEN is unset', () => {
      expect(verifyHoneybadgerRequest({ 'honeybadger-token': TOKEN }, '')).toBe(false);
      delete process.env.HONEYBADGER_TOKEN;
      expect(verifyHoneybadgerRequest({ 'honeybadger-token': TOKEN })).toBe(false);
      process.env.HONEYBADGER_TOKEN = TOKEN;
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain')
        .set('Honeybadger-Token', TOKEN);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set('Honeybadger-Token', TOKEN);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await post('[1,2]').set('Honeybadger-Token', TOKEN);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without a token', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (event) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload(event))).set('Honeybadger-Token', TOKEN);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload('something_new'))).set('Honeybadger-Token', TOKEN);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
