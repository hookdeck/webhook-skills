const request = require('supertest');

// Set test environment variables before importing the app
process.env.PINGONE_WEBHOOK_SECRET = 'Bearer test_pingone_header_value_0123456789';
process.env.PINGONE_WEBHOOK_HEADER = 'Authorization';

const app = require('../src/index');
const { verifyPingOneRequest, parseEvents } = require('../src/index');

const SECRET = process.env.PINGONE_WEBHOOK_SECRET;

// Shape of a PingOne ACTIVITY audit event
function sampleEvent(type = 'USER.CREATED', id = 'evt-1') {
  return {
    id,
    createdAt: '2026-10-25T10:00:00.000Z',
    action: { type, description: type },
    actors: { user: { id: 'u-1', name: 'jane' } },
    resources: [{ id: 'r-1', type: 'USER' }]
  };
}

function post(body, contentType = 'application/json') {
  return request(app).post('/webhooks/pingone').set('Content-Type', contentType).send(body);
}

const jsonArray = (...types) => JSON.stringify(types.map((t, i) => sampleEvent(t, `evt-${i}`)));
const ndjson = (...types) => types.map((t, i) => JSON.stringify(sampleEvent(t, `evt-${i}`))).join('\n') + '\n';

describe('PingOne webhook endpoint', () => {
  describe('Credential check', () => {
    it('accepts the exact header value', async () => {
      const res = await post(jsonArray('USER.CREATED')).set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: 1 });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post(jsonArray('USER.CREATED')).set('authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('compares the whole value: the bare token without "Bearer " is rejected', async () => {
      const res = await post(jsonArray('USER.CREATED')).set('Authorization', SECRET.replace('Bearer ', ''));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await post(jsonArray('USER.CREATED')).set('Authorization', 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await post(jsonArray('USER.CREATED')).set('Authorization', 'short');
      expect(res.status).toBe(401);
    });

    it('returns 401 when the header is missing', async () => {
      const res = await post(jsonArray('USER.CREATED'));
      expect(res.status).toBe(401);
    });

    it('authenticates before parsing: bad credentials plus bad body is 401, not 400', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('Body formats', () => {
    it('handles a JSON_ARRAY batch', async () => {
      const res = await post(jsonArray('USER.CREATED', 'USER.UPDATED', 'AUTHENTICATION.CREATED')).set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: 3 });
    });

    it('handles ND_JSON, one event per line', async () => {
      const res = await post(ndjson('USER.CREATED', 'USER.UPDATED'), 'application/x-ndjson').set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: 2 });
    });

    it('handles a single-line ND_JSON body', async () => {
      const res = await post(ndjson('USER.CREATED')).set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: 1 });
    });

    it('reads the body whatever the content type is', async () => {
      const res = await post(jsonArray('USER.CREATED'), 'text/plain').set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('handles every example event and unknown events', async () => {
      const types = ['USER.CREATED', 'USER.UPDATED', 'USER.DELETED', 'AUTHENTICATION.CREATED', 'PASSWORD.RESET', 'SOMETHING.ELSE'];
      const res = await post(jsonArray(...types)).set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: types.length });
    });

    it('returns 400 for an invalid body', async () => {
      const res = await post('{not json').set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for an empty body', async () => {
      const res = await post('').set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 when the array holds non-objects', async () => {
      const res = await post('[1,2,3]').set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });
  });

  describe('verifyPingOneRequest', () => {
    it('rejects everything when no secret is configured', () => {
      expect(verifyPingOneRequest({ authorization: '' }, {})).toBe(false);
      expect(verifyPingOneRequest({ authorization: 'anything' }, {})).toBe(false);
    });

    it('uses a custom header name', () => {
      const config = { PINGONE_WEBHOOK_SECRET: 's3cret', PINGONE_WEBHOOK_HEADER: 'X-PingOne-Token' };
      expect(verifyPingOneRequest({ 'x-pingone-token': 's3cret' }, config)).toBe(true);
      expect(verifyPingOneRequest({ authorization: 's3cret' }, config)).toBe(false);
    });

    it('defaults the header name to Authorization', () => {
      expect(verifyPingOneRequest({ authorization: 's3cret' }, { PINGONE_WEBHOOK_SECRET: 's3cret' })).toBe(true);
    });

    it('does not parse Basic values: the whole header must match', () => {
      const config = { PINGONE_WEBHOOK_SECRET: 'Basic username:password' };
      expect(verifyPingOneRequest({ authorization: 'Basic username:password' }, config)).toBe(true);
      expect(verifyPingOneRequest({ authorization: 'Basic dXNlcm5hbWU6cGFzc3dvcmQ=' }, config)).toBe(false);
    });

    it('handles non-ASCII values', () => {
      expect(verifyPingOneRequest({ authorization: 'pässwörd' }, { PINGONE_WEBHOOK_SECRET: 'pässwörd' })).toBe(true);
    });
  });

  describe('parseEvents', () => {
    it('parses a pretty-printed JSON array', () => {
      expect(parseEvents(JSON.stringify([sampleEvent()], null, 2))).toHaveLength(1);
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
