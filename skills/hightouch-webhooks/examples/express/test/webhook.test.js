const request = require('supertest');

// Set test environment variables before importing the app
process.env.HIGHTOUCH_WEBHOOK_SECRET = 'Bearer test_hightouch_secret_0123456789';
delete process.env.HIGHTOUCH_WEBHOOK_HEADER; // default: Authorization

const app = require('../src/index');
const { verifyHightouchRequest } = require('../src/index');

const SECRET = process.env.HIGHTOUCH_WEBHOOK_SECRET;

const row = { id: 'cus_123', email: 'alice@example.com', first_name: 'Alice' };

function send(method = 'post', body = JSON.stringify(row), contentType = 'application/json') {
  const req = request(app)[method]('/webhooks/hightouch');
  if (body === null) return req;
  return req.set('Content-Type', contentType).send(body);
}

describe('Hightouch webhook endpoint', () => {
  describe('credential header verification', () => {
    it('accepts the exact header value (Authorization by default)', async () => {
      const res = await send().set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true, trigger: 'row_added' });
    });

    it('looks the header name up case-insensitively', async () => {
      const res = await send().set('authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('compares the WHOLE value: the part after "Bearer " alone is rejected', async () => {
      const res = await send().set('Authorization', SECRET.replace('Bearer ', ''));
      expect(res.status).toBe(401);
    });

    it('does not strip or normalise a Bearer prefix', async () => {
      const res = await send().set('Authorization', SECRET.replace('Bearer', 'bearer'));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await send().set('Authorization', 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await send().set('Authorization', 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await send();
      expect(res.status).toBe(401);
    });

    it('authenticates before parsing the body (invalid JSON + no credential = 401)', async () => {
      const res = await send('post', '{not json');
      expect(res.status).toBe(401);
    });

    it('rejects everything when the secret is not configured', async () => {
      const saved = process.env.HIGHTOUCH_WEBHOOK_SECRET;
      delete process.env.HIGHTOUCH_WEBHOOK_SECRET;
      try {
        const res = await send().set('Authorization', 'anything');
        expect(res.status).toBe(401);
      } finally {
        process.env.HIGHTOUCH_WEBHOOK_SECRET = saved;
      }
    });

    it('reads a custom header name from HIGHTOUCH_WEBHOOK_HEADER', async () => {
      process.env.HIGHTOUCH_WEBHOOK_HEADER = 'X-Hightouch-Key';
      try {
        const ok = await send().set('x-hightouch-key', SECRET);
        expect(ok.status).toBe(200);
        // The default header no longer counts.
        const bad = await send().set('Authorization', SECRET);
        expect(bad.status).toBe(401);
      } finally {
        delete process.env.HIGHTOUCH_WEBHOOK_HEADER;
      }
    });
  });

  describe('request methods', () => {
    it.each([
      ['post', 'row_added'],
      ['put', 'row_changed'],
      ['patch', 'row_changed'],
      ['delete', 'row_removed'],
    ])('accepts %s and maps it to %s', async (method, trigger) => {
      const res = await send(method).set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true, trigger });
    });

    it('accepts a GET with no body', async () => {
      const res = await send('get', null).set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body.trigger).toBe('unmapped');
    });

    it('still requires the credential on GET', async () => {
      const res = await send('get', null);
      expect(res.status).toBe(401);
    });

    it('rejects methods that are not in the list', async () => {
      const res = await request(app).options('/webhooks/hightouch').set('Authorization', SECRET);
      expect(res.status).toBe(405);
    });
  });

  describe('request bodies', () => {
    it('accepts an empty body on POST', async () => {
      const res = await request(app)
        .post('/webhooks/hightouch')
        .set('Content-Type', 'application/json')
        .set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts a batched array body', async () => {
      const res = await send('post', JSON.stringify([row, { ...row, id: 'cus_456' }])).set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts a batch wrapped in an object', async () => {
      const res = await send('post', JSON.stringify({ users: [row] })).set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts any content type (JSON sent as text/plain)', async () => {
      const res = await send('post', JSON.stringify(row), 'text/plain').set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts a +json content type', async () => {
      const res = await send('put', JSON.stringify(row), 'application/vnd.api+json').set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await send('post', '{not json').set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });
  });

  describe('verifyHightouchRequest', () => {
    it('works with explicit secret and header name', () => {
      expect(verifyHightouchRequest({ 'x-key': 'abc' }, 'abc', 'X-Key')).toBe(true);
      expect(verifyHightouchRequest({ 'x-key': 'abd' }, 'abc', 'X-Key')).toBe(false);
      expect(verifyHightouchRequest({}, 'abc', 'X-Key')).toBe(false);
      expect(verifyHightouchRequest({ 'x-key': 'abc' }, '', 'X-Key')).toBe(false);
    });
  });
});
