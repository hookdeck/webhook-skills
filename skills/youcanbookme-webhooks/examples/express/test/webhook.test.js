const request = require('supertest');

// Set test environment variables before importing the app
process.env.YOUCANBOOKME_WEBHOOK_HEADER = 'X-Ycbm-Secret';
process.env.YOUCANBOOKME_WEBHOOK_SECRET = 'Bearer test_secret_0123456789';

const app = require('../src/index');
const { verifyYoucanbookmeRequest } = require('../src/index');

const HEADER = process.env.YOUCANBOOKME_WEBHOOK_HEADER;
const SECRET = process.env.YOUCANBOOKME_WEBHOOK_SECRET;

const EVENTS = [
  'booking_made', 'booking_rescheduled', 'booking_cancelled', 'reminder', 'follow_up', 'no_show',
];

function samplePayload(event = 'booking_made') {
  return { event, email: 'jane@example.com', start: '2026-11-02 10:00' };
}

function send(method = 'post', body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  const req = request(app)[method]('/webhooks/youcanbookme');
  if (body !== undefined) req.set('Content-Type', contentType).send(body);
  return req;
}

describe('YouCanBookMe webhook endpoint', () => {
  describe('secret header verification', () => {
    it('accepts the correct header and value', async () => {
      const res = await send().set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await send().set(HEADER.toLowerCase(), SECRET);
      expect(res.status).toBe(200);
    });

    it('compares the whole value, including a Bearer prefix', async () => {
      const res = await send().set(HEADER, SECRET.replace('Bearer ', ''));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await send().set(HEADER, 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await send().set(HEADER, 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await send();
      expect(res.status).toBe(401);
    });

    it('rejects the secret sent under a different header name', async () => {
      const res = await send().set('Authorization', SECRET);
      expect(res.status).toBe(401);
    });

    it('rejects everything when the secret is unset', () => {
      const headers = { 'x-ycbm-secret': SECRET };
      expect(verifyYoucanbookmeRequest(headers, { secret: '' })).toBe(false);
      delete process.env.YOUCANBOOKME_WEBHOOK_SECRET;
      expect(verifyYoucanbookmeRequest(headers)).toBe(false);
      process.env.YOUCANBOOKME_WEBHOOK_SECRET = SECRET;
    });

    it('defaults the header name to Authorization', () => {
      delete process.env.YOUCANBOOKME_WEBHOOK_HEADER;
      expect(verifyYoucanbookmeRequest({ authorization: SECRET })).toBe(true);
      expect(verifyYoucanbookmeRequest({ authorization: 'nope' })).toBe(false);
      process.env.YOUCANBOOKME_WEBHOOK_HEADER = HEADER;
    });
  });

  describe('methods', () => {
    it.each(['post', 'put', 'patch', 'delete'])('accepts %s with a body', async (method) => {
      const res = await send(method).set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts GET with an empty body', async () => {
      const res = await send('get', undefined).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('accepts POST with an empty body', async () => {
      const res = await send('post', undefined).set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('rejects an unauthenticated GET', async () => {
      const res = await send('get', undefined);
      expect(res.status).toBe(401);
    });
  });

  describe('body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await send('post', JSON.stringify(samplePayload()), 'text/plain').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await send('post', '{not json').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await send('post', '[1,2]').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await send('post', '{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('event handling', () => {
    it.each(EVENTS)('handles %s', async (event) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await send('post', JSON.stringify(samplePayload(event))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await send('post', JSON.stringify(samplePayload('something_new'))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
