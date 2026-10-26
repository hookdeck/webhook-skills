const request = require('supertest');

// Set test environment variables before importing the app
process.env.CURRENTS_WEBHOOK_HEADER = 'Authorization';
process.env.CURRENTS_WEBHOOK_SECRET = 'Bearer test_currents_secret_0123456789';

const app = require('../src/index');
const { verifyCurrentsRequest } = require('../src/index');

const SECRET = process.env.CURRENTS_WEBHOOK_SECRET;

const EVENTS = ['RUN_START', 'RUN_FINISH', 'RUN_TIMEOUT', 'RUN_CANCELED'];

function samplePayload(event = 'RUN_FINISH') {
  return {
    event,
    runUrl: 'https://app.currents.dev/run/950a13c3edf4f28b6e8ce301a404b4aa',
    buildId: 'demo-build-cdx3314',
    groupId: 'chromium',
    tags: ['smoke'],
    commit: { sha: '5a7edc9a156e417068060d67109021351fc7d9b8', branch: 'feature-A' },
    overall: 24, passes: 21, failures: 2, pending: 0, skipped: 1, retries: 3, flaky: 1
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/currents')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Currents webhook endpoint', () => {
  describe('secret header verification', () => {
    it('accepts the exact header value', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('does not strip a Bearer prefix (whole value only)', async () => {
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

    it('rejects a forged x-timestamp without the secret', async () => {
      const res = await post().set('x-timestamp', String(Date.now()));
      expect(res.status).toBe(401);
    });

    it('honours a custom header name', () => {
      expect(verifyCurrentsRequest({ 'x-currents-secret': 'abc' }, 'abc', 'X-Currents-Secret')).toBe(true);
      expect(verifyCurrentsRequest({ 'x-currents-secret': 'abd' }, 'abc', 'X-Currents-Secret')).toBe(false);
      expect(verifyCurrentsRequest({ authorization: 'abc' }, 'abc', 'X-Currents-Secret')).toBe(false);
    });

    it('rejects everything when the secret is unset', () => {
      expect(verifyCurrentsRequest({ authorization: SECRET }, '')).toBe(false);
      delete process.env.CURRENTS_WEBHOOK_SECRET;
      expect(verifyCurrentsRequest({ authorization: SECRET })).toBe(false);
      process.env.CURRENTS_WEBHOOK_SECRET = SECRET;
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain')
        .set('Authorization', SECRET);
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

    it('returns 401, not 400, for invalid JSON without the header', async () => {
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

    it('acknowledges unknown events', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload('RUN_SOMETHING_NEW'))).set('Authorization', SECRET);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
