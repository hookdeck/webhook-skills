const request = require('supertest');

// Set test environment variables before importing the app
process.env.ROLLER_WEBHOOK_API_KEY = 'test_roller_api_key_0123456789abcdef';

const app = require('../src/index');
const { verifyRollerRequest } = require('../src/index');

const KEY = process.env.ROLLER_WEBHOOK_API_KEY;

const EVENTS = ['Booking.Created', 'Booking.Updated', 'Booking.Cancelled', 'Customer.Created', 'Redemption.Created', 'PaymentLink.Created'];

// ROLLER sends `type` and `eventType` as separate fields.
function eventBody(event) {
  const [type, eventType] = event.split('.');
  return JSON.stringify({ type, eventType });
}

function post(body = eventBody('Booking.Created'), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/roller')
    .set('Content-Type', contentType)
    .send(body);
}

describe('ROLLER webhook endpoint', () => {
  describe('x-roller-apikey verification', () => {
    it('accepts the correct key', async () => {
      const res = await post().set('x-roller-apikey', KEY);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('X-ROLLER-APIKEY', KEY);
      expect(res.status).toBe(200);
    });

    it('rejects a wrong key of the same length', async () => {
      const res = await post().set('x-roller-apikey', 'x'.repeat(KEY.length));
      expect(res.status).toBe(401);
    });

    it('rejects a key of a different length without throwing', async () => {
      const res = await post().set('x-roller-apikey', 'short');
      expect(res.status).toBe(401);
    });

    it('compares the whole value (no prefix or suffix match)', async () => {
      expect((await post().set('x-roller-apikey', `${KEY}extra`)).status).toBe(401);
      expect((await post().set('x-roller-apikey', KEY.slice(0, -1))).status).toBe(401);
    });

    it('rejects a missing key', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects everything when ROLLER_WEBHOOK_API_KEY is unset', () => {
      expect(verifyRollerRequest({ 'x-roller-apikey': KEY }, '')).toBe(false);
      delete process.env.ROLLER_WEBHOOK_API_KEY;
      expect(verifyRollerRequest({ 'x-roller-apikey': KEY })).toBe(false);
      process.env.ROLLER_WEBHOOK_API_KEY = KEY;
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(eventBody('Booking.Created'), 'text/plain')
        .set('x-roller-apikey', KEY);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set('x-roller-apikey', KEY);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await post('[1,2]').set('x-roller-apikey', KEY);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without a key', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (type) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(eventBody(type)).set('x-roller-apikey', KEY);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(eventBody('Something.New')).set('x-roller-apikey', KEY);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
