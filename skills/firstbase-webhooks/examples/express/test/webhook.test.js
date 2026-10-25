const request = require('supertest');

// Set test environment variables before importing the app
process.env.FIRSTBASE_WEBHOOK_HEADER = 'X-Firstbase-Key';
process.env.FIRSTBASE_WEBHOOK_SECRET = 'Bearer test_firstbase_secret_0123456789';

const app = require('../src/index');
const { verifyFirstbaseRequest } = require('../src/index');

const HEADER = process.env.FIRSTBASE_WEBHOOK_HEADER;
const SECRET = process.env.FIRSTBASE_WEBHOOK_SECRET;

const EVENT_TYPES = ['CREATED', 'UPDATED', 'DELETED'];

function samplePayload(eventType = 'CREATED') {
  return { eventType, id: 'ord_12345' };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/firstbase')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Firstbase webhook endpoint', () => {
  describe('custom header verification', () => {
    it('accepts the exact header value', async () => {
      const res = await post().set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set(HEADER.toLowerCase(), SECRET);
      expect(res.status).toBe(200);
    });

    it('compares the whole value, including the Bearer prefix', async () => {
      const res = await post().set(HEADER, SECRET.replace('Bearer ', ''));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await post().set(HEADER, 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of a different length', async () => {
      const res = await post().set(HEADER, 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects the secret sent under a different header name', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(401);
    });

    it('rejects non-ASCII values without throwing', async () => {
      const res = await post().set(HEADER, Buffer.from('é-secret', 'utf8').toString('latin1'));
      expect(res.status).toBe(401);
    });

    it('rejects everything when the secret is not configured', () => {
      expect(verifyFirstbaseRequest({ [HEADER.toLowerCase()]: SECRET }, HEADER, '')).toBe(false);
      delete process.env.FIRSTBASE_WEBHOOK_SECRET;
      try {
        expect(verifyFirstbaseRequest({ [HEADER.toLowerCase()]: SECRET }, HEADER)).toBe(false);
      } finally {
        process.env.FIRSTBASE_WEBHOOK_SECRET = SECRET;
      }
    });

    it('defaults the header name to Authorization', () => {
      delete process.env.FIRSTBASE_WEBHOOK_HEADER;
      try {
        expect(verifyFirstbaseRequest({ authorization: SECRET })).toBe(true);
        expect(verifyFirstbaseRequest({ [HEADER.toLowerCase()]: SECRET })).toBe(false);
      } finally {
        process.env.FIRSTBASE_WEBHOOK_HEADER = HEADER;
      }
    });
  });

  describe('body handling', () => {
    it.each(EVENT_TYPES)('handles %s notifications', async (eventType) => {
      const res = await post(JSON.stringify(samplePayload(eventType))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts an unknown eventType', async () => {
      const res = await post(JSON.stringify(samplePayload('ARCHIVED'))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts any content type', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await post('not json', 'application/json').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object body', async () => {
      const res = await post('[1,2]').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('authenticates before parsing: bad credential and bad JSON is 401', async () => {
      const res = await post('not json');
      expect(res.status).toBe(401);
    });
  });
});
