const request = require('supertest');

// Set test environment variables before importing the app
process.env.NEW_RELIC_WEBHOOK_USERNAME = 'newrelic';
process.env.NEW_RELIC_WEBHOOK_PASSWORD = 'p@ss:word, with: colons';

const app = require('../src/index');
const { verifyNewRelicRequest } = require('../src/index');

const USER = process.env.NEW_RELIC_WEBHOOK_USERNAME;
const PASS = process.env.NEW_RELIC_WEBHOOK_PASSWORD;

function basic(user, pass, scheme = 'Basic') {
  return `${scheme} ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

const STATES = ['CREATED', 'ACTIVATED', 'CLOSED'];

// Illustrative payload from the Handlebars template in references/setup.md
function samplePayload(state = 'ACTIVATED', acknowledged = false) {
  return {
    issueId: 'a1b2c3d4-0000-4000-8000-000000000001',
    title: 'High CPU on web-1',
    state,
    acknowledged,
    priority: 'CRITICAL',
    issuePageUrl: 'https://one.newrelic.com/alerts-ai/issues/a1b2c3d4'
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/new-relic')
    .set('Content-Type', contentType)
    .send(body);
}

describe('New Relic webhook endpoint', () => {
  describe('Basic authentication', () => {
    it('accepts the correct credentials', async () => {
      const res = await post().set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('accepts the scheme case-insensitively', async () => {
      const res = await post().set('Authorization', basic(USER, PASS, 'basic'));
      expect(res.status).toBe(200);
    });

    it('splits on the first colon only (password contains colons)', async () => {
      expect(verifyNewRelicRequest({ authorization: basic(USER, PASS) })).toBe(true);
    });

    it('handles non-ASCII credentials', () => {
      const headers = { authorization: basic('üser', 'pässwörd:✓') };
      expect(verifyNewRelicRequest(headers, 'üser', 'pässwörd:✓')).toBe(true);
      expect(verifyNewRelicRequest(headers, 'user', 'password')).toBe(false);
    });

    it('rejects a wrong password', async () => {
      const res = await post().set('Authorization', basic(USER, 'x'.repeat(PASS.length)));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong username', async () => {
      const res = await post().set('Authorization', basic('nobody', PASS));
      expect(res.status).toBe(401);
    });

    it('rejects a different-length password without throwing', async () => {
      const res = await post().set('Authorization', basic(USER, 'short'));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects the Bearer scheme', async () => {
      const res = await post().set('Authorization', `Bearer ${PASS}`);
      expect(res.status).toBe(401);
    });

    it('rejects credentials with no colon', async () => {
      const res = await post().set('Authorization', `Basic ${Buffer.from('nocolon').toString('base64')}`);
      expect(res.status).toBe(401);
    });

    it('rejects a malformed header', async () => {
      expect((await post().set('Authorization', 'Basic')).status).toBe(401);
      expect((await post().set('Authorization', '!!!')).status).toBe(401);
    });

    it('rejects everything when credentials are unconfigured', () => {
      const headers = { authorization: basic(USER, PASS) };
      expect(verifyNewRelicRequest(headers, '', PASS)).toBe(false);
      expect(verifyNewRelicRequest(headers, USER, '')).toBe(false);
      delete process.env.NEW_RELIC_WEBHOOK_USERNAME;
      expect(verifyNewRelicRequest(headers)).toBe(false);
      process.env.NEW_RELIC_WEBHOOK_USERNAME = USER;
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain')
        .set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await post('[1,2]').set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without credentials', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('Issue state handling', () => {
    it.each(STATES)('handles %s', async (state) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload(state))).set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('handles an acknowledged issue via the acknowledged boolean', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload('ACTIVATED', true))).set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Issue acknowledged'))).toBe(true);
      spy.mockRestore();
    });

    it('acknowledges unknown states', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload('SOMETHING_NEW'))).set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
