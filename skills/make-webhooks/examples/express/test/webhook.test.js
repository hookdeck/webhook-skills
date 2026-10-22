const request = require('supertest');

// Set test environment variables before importing the app
process.env.MAKE_WEBHOOK_SECRET = 'Bearer test_make_shared_secret_0123456789';
process.env.MAKE_WEBHOOK_HEADER = 'Authorization';

const app = require('../src/index');
const { verifyMakeRequest } = require('../src/index');

const SECRET = process.env.MAKE_WEBHOOK_SECRET;

// What a Make HTTP > Make a request module would send with application/json
function samplePayload(event = 'order.created') {
  return {
    event,
    id: 'bundle_1042',
    data: { order_id: 'ord_123', email: 'jane@example.com', scenario_name: 'Orders sync' }
  };
}

function send(method, body = JSON.stringify(samplePayload())) {
  const req = request(app)[method]('/webhooks/make');
  return method === 'get' ? req : req.set('Content-Type', 'application/json').send(body);
}

describe('Make webhook endpoint', () => {
  describe('API key header', () => {
    it('accepts the exact header value', async () => {
      const res = await send('post').set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await send('post').set('authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('compares the whole value: the bare secret without "Bearer " is rejected', async () => {
      const res = await send('post').set('Authorization', SECRET.replace(/^Bearer /, ''));
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

    it('returns 401 when the header is missing', async () => {
      const res = await send('post');
      expect(res.status).toBe(401);
    });
  });

  describe('Methods and bodies', () => {
    it.each(['post', 'put', 'patch', 'delete'])('accepts %s with a JSON body', async (method) => {
      const res = await send(method).set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts GET with no body', async () => {
      const res = await send('get').set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('rejects an unauthenticated GET', async () => {
      const res = await send('get');
      expect(res.status).toBe(401);
    });

    it('accepts a JSON body sent with a non-JSON content type', async () => {
      const res = await request(app)
        .post('/webhooks/make')
        .set('Authorization', SECRET)
        .set('Content-Type', 'text/plain')
        .send(JSON.stringify(samplePayload()));
      expect(res.status).toBe(200);
    });

    it('accepts an empty POST body', async () => {
      const res = await request(app).post('/webhooks/make').set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 405 for other methods', async () => {
      const res = await request(app).options('/webhooks/make');
      expect(res.status).toBe(405);
    });
  });

  describe('Request handling', () => {
    it('returns 400 for an invalid JSON body', async () => {
      const res = await send('post', '{not json').set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await send('post', '[1,2,3]').set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });

    it('does not parse the body before authenticating', async () => {
      const res = await send('post', '{not json');
      expect(res.status).toBe(401);
    });

    it('handles every example event and unknown events', async () => {
      const events = ['order.created', 'lead.created', 'scenario.completed', 'scenario.failed', 'something.else'];
      for (const event of events) {
        const res = await send('post', JSON.stringify(samplePayload(event))).set('Authorization', SECRET);
        expect(res.status).toBe(200);
      }
    });
  });

  describe('verifyMakeRequest', () => {
    it('rejects everything when no secret is configured', () => {
      expect(verifyMakeRequest({ authorization: '' }, {})).toBe(false);
      expect(verifyMakeRequest({}, {})).toBe(false);
    });

    it('uses a custom header name', () => {
      const config = { MAKE_WEBHOOK_SECRET: 's3cret', MAKE_WEBHOOK_HEADER: 'X-Make-Key' };
      expect(verifyMakeRequest({ 'x-make-key': 's3cret' }, config)).toBe(true);
      expect(verifyMakeRequest({ authorization: 's3cret' }, config)).toBe(false);
    });

    it('defaults the header name to Authorization', () => {
      expect(verifyMakeRequest({ authorization: 's3cret' }, { MAKE_WEBHOOK_SECRET: 's3cret' })).toBe(true);
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
