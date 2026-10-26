const request = require('supertest');

// Set test environment variables before importing the app
process.env.WORKATO_WEBHOOK_USERNAME = 'workato';
process.env.WORKATO_WEBHOOK_PASSWORD = 'test_workato_password:with-colon';

const app = require('../src/index');
const { verifyWorkatoRequest } = require('../src/index');

const USER = process.env.WORKATO_WEBHOOK_USERNAME;
const PASSWORD = process.env.WORKATO_WEBHOOK_PASSWORD;

function basic(user, password) {
  return 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64');
}

// What a Workato HTTP action would send (the body is whatever the recipe builds)
function samplePayload(event = 'order.created') {
  return {
    event,
    data: { order_id: 'ord_123', record_id: 'rec_9', recipe_name: 'Orders sync', error: 'timeout' }
  };
}

const GOOD = basic(USER, PASSWORD);

function send(method, auth = GOOD, body = JSON.stringify(samplePayload())) {
  let req = request(app)[method]('/webhooks/workato');
  if (auth) req = req.set('Authorization', auth);
  if (body !== undefined) req = req.set('Content-Type', 'application/json').send(body);
  return req;
}

describe('Workato webhook endpoint', () => {
  describe('Basic auth', () => {
    it('accepts the configured username and password (password contains a colon)', async () => {
      const res = await send('post');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('treats the scheme case-insensitively', async () => {
      const res = await send('post', 'basic ' + GOOD.slice(6));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong password of the same length', async () => {
      const res = await send('post', basic(USER, 'x'.repeat(PASSWORD.length)));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong password of a different length without throwing', async () => {
      expect((await send('post', basic(USER, 'short'))).status).toBe(401);
    });

    it('rejects a wrong username', async () => {
      expect((await send('post', basic('admin', PASSWORD))).status).toBe(401);
    });

    it('returns 401 when the Authorization header is missing', async () => {
      expect((await send('post', null)).status).toBe(401);
    });

    it('returns 401 for a non-Basic scheme', async () => {
      expect((await send('post', 'Bearer ' + PASSWORD)).status).toBe(401);
    });

    it('returns 401 for a malformed header (no colon after decoding)', async () => {
      const res = await send('post', 'Basic ' + Buffer.from('nocolon').toString('base64'));
      expect(res.status).toBe(401);
    });
  });

  describe('HTTP methods', () => {
    it.each(['post', 'put', 'patch', 'delete'])('accepts %s with a JSON body', async (method) => {
      expect((await send(method)).status).toBe(200);
    });

    it.each(['get', 'delete'])('accepts %s with no body', async (method) => {
      const res = await send(method, GOOD, undefined);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('still authenticates a GET', async () => {
      expect((await send('get', null, undefined)).status).toBe(401);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (authentication does not depend on parsing)', async () => {
      const res = await request(app)
        .post('/webhooks/workato')
        .set('Authorization', GOOD)
        .set('Content-Type', 'text/plain')
        .send(JSON.stringify(samplePayload()));
      expect(res.status).toBe(200);
    });

    it('returns 400 for an invalid JSON body', async () => {
      expect((await send('post', GOOD, '{not json')).status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      expect((await send('post', GOOD, '[1,2,3]')).status).toBe(400);
    });

    it('returns 401, not 400, for a bad body without credentials', async () => {
      expect((await send('post', null, '{not json')).status).toBe(401);
    });

    it('handles every example event and unknown events', async () => {
      for (const event of ['order.created', 'record.updated', 'recipe.failed', 'something.else']) {
        const res = await send('post', GOOD, JSON.stringify(samplePayload(event)));
        expect(res.status).toBe(200);
      }
    });
  });

  describe('verifyWorkatoRequest', () => {
    it('rejects everything when credentials are not configured', () => {
      expect(verifyWorkatoRequest({ authorization: basic('', '') }, {})).toBe(false);
      expect(verifyWorkatoRequest({ authorization: GOOD }, { WORKATO_WEBHOOK_USERNAME: USER })).toBe(false);
    });
  });

  describe('GET /health', () => {
    it('returns ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });
});
