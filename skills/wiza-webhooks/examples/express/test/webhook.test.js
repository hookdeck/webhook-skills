const crypto = require('crypto');
const request = require('supertest');

// Set test environment variables before importing the app
process.env.WIZA_API_KEY = 'test_wiza_api_key_0123456789';

const app = require('../src/index');
const { verifyWizaRequest } = require('../src/index');

const API_KEY = process.env.WIZA_API_KEY;
// What Wiza sends: lowercase hex SHA-256 of the API key
const AUTH_KEY = crypto.createHash('sha256').update(API_KEY).digest('hex');

function samplePayload(code = 200) {
  return {
    status: { code, message: code === 200 ? 'Single reveal finished' : 'Failed' },
    type: 'individual_reveal',
    data: { id: 12345, status: code === 200 ? 'finished' : 'failed', email: 'jane@example.com', name: 'Jane Doe' },
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/wiza')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Wiza webhook endpoint', () => {
  describe('x-auth-key verification', () => {
    it('accepts the SHA-256 hex of the API key', async () => {
      const res = await post().set('x-auth-key', AUTH_KEY);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('X-Auth-Key', AUTH_KEY);
      expect(res.status).toBe(200);
    });

    it('rejects the raw API key (must be the hash)', async () => {
      const res = await post().set('x-auth-key', API_KEY);
      expect(res.status).toBe(401);
    });

    it('rejects a wrong hash of the same length', async () => {
      const res = await post().set('x-auth-key', 'a'.repeat(AUTH_KEY.length));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await post().set('x-auth-key', 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects a hash of a different API key', async () => {
      const other = crypto.createHash('sha256').update('another-key').digest('hex');
      const res = await post().set('x-auth-key', other);
      expect(res.status).toBe(401);
    });

    it('rejects everything when WIZA_API_KEY is unset', () => {
      expect(verifyWizaRequest({ 'x-auth-key': AUTH_KEY }, '')).toBe(false);
      delete process.env.WIZA_API_KEY;
      expect(verifyWizaRequest({ 'x-auth-key': AUTH_KEY })).toBe(false);
      process.env.WIZA_API_KEY = API_KEY;
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set('x-auth-key', AUTH_KEY);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set('x-auth-key', AUTH_KEY);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await post('[1,2]').set('x-auth-key', AUTH_KEY);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    let spy;
    beforeEach(() => { spy = jest.spyOn(console, 'log').mockImplementation(() => {}); });
    afterEach(() => spy.mockRestore());

    it('handles a finished individual_reveal', async () => {
      const res = await post().set('x-auth-key', AUTH_KEY);
      expect(res.status).toBe(200);
      expect(spy).toHaveBeenCalledWith('Reveal 12345 finished');
    });

    it('handles a failed individual_reveal', async () => {
      const res = await post(JSON.stringify(samplePayload(400))).set('x-auth-key', AUTH_KEY);
      expect(res.status).toBe(200);
      expect(spy).toHaveBeenCalledWith('Reveal 12345 failed');
    });

    it('acknowledges unknown types', async () => {
      const res = await post(JSON.stringify({ type: 'something_new', data: { id: 1 } })).set('x-auth-key', AUTH_KEY);
      expect(res.status).toBe(200);
      expect(spy).toHaveBeenCalledWith('Unhandled event type: something_new');
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
