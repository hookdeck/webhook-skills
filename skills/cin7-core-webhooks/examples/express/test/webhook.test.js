const request = require('supertest');

// Set test environment variables before importing the app
process.env.CIN7_CORE_WEBHOOK_HEADER = 'X-Cin7-Token';
process.env.CIN7_CORE_WEBHOOK_SECRET = 'Bearer test_cin7_token_0123456789';

const app = require('../src/index');
const { verifyCin7CoreRequest } = require('../src/index');

const HEADER = process.env.CIN7_CORE_WEBHOOK_HEADER;
const SECRET = process.env.CIN7_CORE_WEBHOOK_SECRET;

const EVENTS = [
  'Sale/Created', 'Sale/OrderAuthorised', 'Sale/ShipmentAuthorised',
  'Purchase/OrderAuthorised', 'Product/Updated'
];

function post(body = JSON.stringify({ EventType: 'Sale/Created' }), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/cin7-core')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Cin7 Core webhook endpoint', () => {
  describe('credential verification', () => {
    it('accepts the exact whole value', async () => {
      const res = await post().set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set(HEADER.toLowerCase(), SECRET);
      expect(res.status).toBe(200);
    });

    it('does not strip the Bearer prefix', async () => {
      const res = await post().set(HEADER, SECRET.replace('Bearer ', ''));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await post().set(HEADER, 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await post().set(HEADER, 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('ignores the credential in a different header', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(401);
    });

    it('defaults to the Authorization header', () => {
      delete process.env.CIN7_CORE_WEBHOOK_HEADER;
      try {
        expect(verifyCin7CoreRequest({ authorization: 'Bearer t' }, { secret: 'Bearer t' })).toBe(true);
      } finally {
        process.env.CIN7_CORE_WEBHOOK_HEADER = HEADER;
      }
    });

    it('rejects everything when the secret is unset', () => {
      expect(verifyCin7CoreRequest({ 'x-cin7-token': SECRET }, { name: HEADER, secret: '' })).toBe(false);
    });
  });

  describe('body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify({ EventType: 'Sale/Created' }), 'text/plain').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await post('[1,2]').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the credential', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('event handling', () => {
    it.each(EVENTS)('handles %s', async (EventType) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify({ EventType })).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify({ EventType: 'Something/New' })).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
