const request = require('supertest');

// Set test environment variables before importing the app.
// The secret is the whole header value, including the "Bearer " prefix the user typed.
const SECRET = 'Bearer test_fireberry_secret_0123456789';
process.env.FIREBERRY_WEBHOOK_SECRET = SECRET;
delete process.env.FIREBERRY_WEBHOOK_HEADER; // default: Authorization

const app = require('../src/index');
const { verifyFireberryRequest } = require('../src/index');

// Illustrative body: Fireberry adds no event field, the automation's author writes the body.
function samplePayload(event = 'account.created') {
  return { event, record: { id: 'a1b2c3', accountname: 'Acme Ltd', statuscode: 'Lead' } };
}

function send(method, body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  const req = request(app)[method]('/webhooks/fireberry');
  return body === null ? req : req.set('Content-Type', contentType).send(body);
}

describe('Fireberry webhook endpoint', () => {
  describe('secret header verification', () => {
    it('accepts the exact header value (default header Authorization)', async () => {
      const res = await send('post').set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await send('post').set('authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('compares the whole value: the bare secret without "Bearer " is rejected', async () => {
      const res = await send('post').set('Authorization', SECRET.replace('Bearer ', ''));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await send('post').set('Authorization', 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await send('post').set('Authorization', 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await send('post');
      expect(res.status).toBe(401);
    });

    it('rejects everything when the secret is unset', () => {
      expect(verifyFireberryRequest({ authorization: SECRET }, '')).toBe(false);
      expect(verifyFireberryRequest({ authorization: SECRET }, undefined, 'Authorization')).toBe(true);
    });

    describe('custom header name', () => {
      beforeAll(() => { process.env.FIREBERRY_WEBHOOK_HEADER = 'X-Fireberry-Secret'; });
      afterAll(() => { delete process.env.FIREBERRY_WEBHOOK_HEADER; });

      it('reads the header named in FIREBERRY_WEBHOOK_HEADER', async () => {
        const res = await send('post').set('x-fireberry-secret', SECRET);
        expect(res.status).toBe(200);
      });

      it('no longer accepts the default Authorization header', async () => {
        const res = await send('post').set('Authorization', SECRET);
        expect(res.status).toBe(401);
      });
    });
  });

  describe('request methods', () => {
    it.each(['post', 'put', 'patch', 'delete'])('accepts %s with a JSON body', async (method) => {
      const res = await send(method).set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it.each(['get', 'delete'])('accepts %s with an empty body', async (method) => {
      const res = await send(method, null).set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('still requires the secret on GET', async () => {
      const res = await send('get', null);
      expect(res.status).toBe(401);
    });

    it('rejects other methods with 405', async () => {
      const res = await request(app).options('/webhooks/fireberry');
      expect(res.status).toBe(405);
    });
  });

  describe('body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await send('post', JSON.stringify(samplePayload()), 'text/plain')
        .set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await send('post', '{not json').set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await send('post', '[1,2]').set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the secret', async () => {
      const res = await send('post', '{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('event handling (illustrative body)', () => {
    it.each(['account.created', 'record.updated'])('handles %s', async (event) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await send('post', JSON.stringify(samplePayload(event))).set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await send('post', JSON.stringify(samplePayload('something.else'))).set('Authorization', SECRET);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
