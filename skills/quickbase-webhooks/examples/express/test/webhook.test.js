const request = require('supertest');

// Set test environment variables before importing the app
process.env.QUICKBASE_WEBHOOK_SECRET = 'Bearer test_quickbase_secret_0123456789';
delete process.env.QUICKBASE_WEBHOOK_HEADER;

const app = require('../src/index');
const { verifyQuickbaseRequest } = require('../src/index');

const SECRET = process.env.QUICKBASE_WEBHOOK_SECRET;

// Illustrative payloads: Quickbase adds no event field; these are user-written templates.
const EVENTS = ['record_added', 'record_modified', 'record_deleted'];

function sample(event = 'record_added') {
  return { event, record_id: 42, table: 'Projects' };
}

function send(method = 'post', body = JSON.stringify(sample()), contentType = 'application/json') {
  const req = request(app)[method]('/webhooks/quickbase');
  if (body === undefined) return req;
  return req.set('Content-Type', contentType).send(body);
}

describe('Quickbase webhook endpoint', () => {
  describe('secret header verification', () => {
    it('accepts the correct whole value in the default Authorization header', async () => {
      const res = await send().set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await send().set('authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await send().set('Authorization', 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await send().set('Authorization', 'short');
      expect(res.status).toBe(401);
    });

    it('rejects the value with the Bearer prefix stripped (whole value is compared)', async () => {
      const res = await send().set('Authorization', SECRET.replace('Bearer ', ''));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await send();
      expect(res.status).toBe(401);
    });

    it('rejects before parsing: invalid body with a bad secret is 401, not an error', async () => {
      const res = await send('post', '{not json', 'application/json').set('Authorization', 'nope');
      expect(res.status).toBe(401);
    });

    it('reads the header name from QUICKBASE_WEBHOOK_HEADER', async () => {
      process.env.QUICKBASE_WEBHOOK_HEADER = 'X-Qb-Secret';
      try {
        const ok = await send().set('x-qb-secret', SECRET);
        expect(ok.status).toBe(200);
        const wrongHeader = await send().set('Authorization', SECRET);
        expect(wrongHeader.status).toBe(401);
      } finally {
        delete process.env.QUICKBASE_WEBHOOK_HEADER;
      }
    });

    it('rejects everything when the secret is not configured', () => {
      expect(verifyQuickbaseRequest({ authorization: 'anything' }, '')).toBe(false);
      expect(verifyQuickbaseRequest({ authorization: 'anything' }, undefined)).toBe(false);
    });

    it('handles non-ASCII secrets', () => {
      expect(verifyQuickbaseRequest({ authorization: Buffer.from('pässword', 'utf8').toString('latin1') }, 'pässword')).toBe(true);
      expect(verifyQuickbaseRequest({ authorization: 'pässwörd' }, 'pässword')).toBe(false);
    });
  });

  describe('HTTP methods', () => {
    it.each(['post', 'put', 'patch'])('accepts %s with a body', async (method) => {
      const res = await send(method).set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it.each(['get', 'delete'])('accepts %s with an empty body', async (method) => {
      const res = await send(method, undefined).set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it.each(['get', 'delete'])('rejects unauthenticated %s', async (method) => {
      const res = await send(method, undefined);
      expect(res.status).toBe(401);
    });

    it('rejects unsupported methods with 405', async () => {
      const res = await request(app).options('/webhooks/quickbase').set('Authorization', SECRET);
      expect(res.status).toBe(405);
    });
  });

  describe('bodies', () => {
    it.each(EVENTS)('handles illustrative %s payloads', async (event) => {
      const res = await send('post', JSON.stringify(sample(event))).set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('acknowledges unrecognized events', async () => {
      const res = await send('post', JSON.stringify({ event: 'something_else' })).set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts an XML body', async () => {
      const res = await send('post', '<record><id>42</id></record>', 'application/xml').set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts a RAW text body', async () => {
      const res = await send('post', 'record 42 changed', 'text/plain').set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts malformed JSON as an opaque body once authenticated', async () => {
      const res = await send('post', '{not json', 'application/json').set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts a request with no Content-Type', async () => {
      const res = await request(app).post('/webhooks/quickbase').set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });
  });

  describe('health', () => {
    it('returns ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
    });
  });
});
