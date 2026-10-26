const request = require('supertest');

// Set test environment variables before importing the app
process.env.AXIOM_WEBHOOK_HEADER = 'X-Axiom-Token';
process.env.AXIOM_WEBHOOK_SECRET = 'Bearer test_axiom_secret_0123456789';

const app = require('../src/index');
const { verifyAxiomRequest } = require('../src/index');

const NAME = process.env.AXIOM_WEBHOOK_HEADER;
const SECRET = process.env.AXIOM_WEBHOOK_SECRET;

// Illustrative payload rendered from Axiom's default Custom webhook template.
function samplePayload(action = 'Open') {
  return {
    action,
    event: {
      monitorID: 'CabI3w142069etTgd0',
      body: 'Current value of 57347 is above or equal to the threshold value of 0',
      description: '',
      queryEndTime: '2024-06-28 14:55:57.631364493 +0000 UTC',
      queryStartTime: '2024-06-28 14:45:57.631364493 +0000 UTC',
      timestamp: '2024-06-28 14:55:57 +0000 UTC',
      title: 'Axiom Monitor Test',
      value: 57347,
      matchedEvent: null,
      groupKeys: null,
      groupValues: null
    }
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/axiom')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Axiom webhook endpoint', () => {
  describe('secret header verification', () => {
    it('accepts the correct header value', async () => {
      const res = await post().set(NAME, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('looks the header up case-insensitively', async () => {
      const res = await post().set(NAME.toLowerCase(), SECRET);
      expect(res.status).toBe(200);
    });

    it('compares the whole value, including the Bearer prefix', async () => {
      const res = await post().set(NAME, SECRET.replace(/^Bearer /, ''));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await post().set(NAME, 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await post().set(NAME, 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('ignores the secret sent under a different header name', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(401);
    });

    it('rejects everything when AXIOM_WEBHOOK_SECRET is unset', () => {
      const headers = { [NAME.toLowerCase()]: SECRET };
      expect(verifyAxiomRequest(headers, { name: NAME, secret: '' })).toBe(false);
      expect(verifyAxiomRequest(headers, { name: NAME, secret: SECRET })).toBe(true);
    });

    it('defaults the header name to Authorization', () => {
      const saved = process.env.AXIOM_WEBHOOK_HEADER;
      delete process.env.AXIOM_WEBHOOK_HEADER;
      expect(verifyAxiomRequest({ authorization: SECRET })).toBe(true);
      process.env.AXIOM_WEBHOOK_HEADER = saved;
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set(NAME, SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set(NAME, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await post('[1,2]').set(NAME, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('Notification handling', () => {
    it.each(['Open', 'Closed'])('handles action %s', async (action) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload(action))).set(NAME, SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown actions', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload('Paused'))).set(NAME, SECRET);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
