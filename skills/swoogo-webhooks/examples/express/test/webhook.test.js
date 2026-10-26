const request = require('supertest');

// Set test environment variables before importing the app
process.env.SWOOGO_WEBHOOK_HEADER = 'Authorization';
process.env.SWOOGO_WEBHOOK_SECRET = 'Bearer test_swoogo_secret_0123456789';

const app = require('../src/index');
const { verifySwoogoRequest } = require('../src/index');

const SECRET = process.env.SWOOGO_WEBHOOK_SECRET;

const OBJECTS = [
  'event', 'contact', 'registrant', 'speaker', 'sponsor', 'session',
  'session_attendance', 'registrant_line_item'
];

// Illustrative: Swoogo documents no delivered example, the body carries the chosen fields.
const PAYLOAD = { id: 1234, first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' };

function post(object = 'registrant', body = JSON.stringify(PAYLOAD), contentType = 'application/json') {
  return request(app)
    .post(`/webhooks/swoogo?object=${object}`)
    .set('Content-Type', contentType)
    .send(body);
}

describe('Swoogo webhook endpoint', () => {
  describe('secret header verification', () => {
    it('accepts the exact whole header value', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('does not strip a Bearer prefix', async () => {
      const res = await post().set('Authorization', 'test_swoogo_secret_0123456789');
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

    it('reads a custom header name from SWOOGO_WEBHOOK_HEADER', () => {
      const headers = { 'x-webhook-secret': 's3cret value' };
      expect(verifySwoogoRequest(headers, 'X-Webhook-Secret', 's3cret value')).toBe(true);
      expect(verifySwoogoRequest(headers, 'X-Webhook-Secret', 's3cret')).toBe(false);
      expect(verifySwoogoRequest(headers, 'Authorization', 's3cret value')).toBe(false);
    });

    it('handles non-ASCII secrets', () => {
      expect(verifySwoogoRequest({ authorization: 'Bearer café' }, 'Authorization', 'Bearer café')).toBe(true);
      expect(verifySwoogoRequest({ authorization: 'Bearer cafe' }, 'Authorization', 'Bearer café')).toBe(false);
    });

    it('rejects everything when no secret is configured', () => {
      const headers = { authorization: SECRET };
      expect(verifySwoogoRequest(headers, 'Authorization', '')).toBe(false);
      expect(verifySwoogoRequest(headers, 'Authorization', SECRET)).toBe(true);
    });
  });

  describe('body handling', () => {
    it('accepts a JSON body', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts a form-encoded body', async () => {
      const res = await post('registrant', 'id=1234&first_name=Ada&email=ada%40example.com',
        'application/x-www-form-urlencoded').set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts any other content type carrying JSON', async () => {
      const res = await post('registrant', JSON.stringify(PAYLOAD), 'text/plain').set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('registrant', '{not json').set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await post('registrant', '[1,2]').set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for an invalid body without the header', async () => {
      const res = await post('registrant', '{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('trigger objects', () => {
    it.each(OBJECTS)('handles %s', async (object) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(object).set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges an unknown object', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post('something_new').set('Authorization', SECRET);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });
});
