const request = require('supertest');

const API_KEY = 'cg_test_api_key_0123456789';
process.env.COVER_GENIUS_API_KEY = API_KEY;

const app = require('../src/index');
const { verifyCoverGeniusRequest } = require('../src/index');

const booking = (event, status = 'CONFIRMED') => ({
  event,
  payload: {
    id: '8AMKH-KQ8NR-INS',
    status,
    currency: 'USD',
    total_price: 68.71,
    total_price_formatted: 'US$68.71',
    partner_transaction_id: null,
    quotes: [],
  },
});

const renewal = (event, status = 'ACTIVE') => ({
  event,
  payload: {
    id: 'daSJp-fwdoj-REN',
    package_id: 'GKDK9-CECQU-INS',
    quote_id: 'c8ddb161-e3d9-455b-9621-96df90f17acb',
    status,
    due_date: '2019-02-25T13:00:00Z',
    expiry_date: '2019-03-25T13:00:00Z',
  },
});

function post(body, headers = { 'X-Api-Key': API_KEY }, contentType = 'application/json') {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  return request(app)
    .post('/webhooks/cover-genius')
    .set({ 'Content-Type': contentType, ...headers })
    .send(raw);
}

describe('Cover Genius webhook (X-Api-Key)', () => {
  describe('authentication', () => {
    it('accepts a request with the correct X-Api-Key', async () => {
      const res = await post(booking('BOOKING_CREATED'));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('rejects a missing X-Api-Key', async () => {
      const res = await post(booking('BOOKING_CREATED'), {});
      expect(res.status).toBe(401);
    });

    it('rejects a wrong X-Api-Key', async () => {
      const res = await post(booking('BOOKING_CREATED'), { 'X-Api-Key': 'wrong_key' });
      expect(res.status).toBe(401);
    });

    it('rejects a key of a different length without throwing', async () => {
      const res = await post(booking('BOOKING_CREATED'), { 'X-Api-Key': 'x' });
      expect(res.status).toBe(401);
    });

    it('rejects a prefixed key (Cover Genius sends the key with no prefix)', async () => {
      const res = await post(booking('BOOKING_CREATED'), { 'X-Api-Key': `Bearer ${API_KEY}` });
      expect(res.status).toBe(401);
    });

    it('does not accept the Authorization Signature header on its own', async () => {
      const res = await post(booking('BOOKING_CREATED'), {
        Authorization: 'Signature keyId="x",algorithm="hmac-sha256",signature="abc"',
        Date: 'Thu, 27 Feb 2025 05:01:47 GMT',
      });
      expect(res.status).toBe(401);
    });

    it('accepts the key with any content type (raw body)', async () => {
      const res = await post(booking('BOOKING_CREATED'), { 'X-Api-Key': API_KEY }, 'text/plain');
      expect(res.status).toBe(200);
    });

    it('fails closed when COVER_GENIUS_API_KEY is not configured', () => {
      expect(verifyCoverGeniusRequest({ 'x-api-key': 'anything' }, '')).toBe(false);
      expect(verifyCoverGeniusRequest({ 'x-api-key': '' }, '')).toBe(false);
      expect(verifyCoverGeniusRequest({ 'x-api-key': API_KEY }, API_KEY)).toBe(true);
    });
  });

  describe('events', () => {
    const events = [
      booking('BOOKING_CREATED'),
      booking('BOOKING_UPDATED'),
      booking('BOOKING_CANCELLED', 'CANCELLED'),
      renewal('RENEWAL_CREATED'),
      renewal('RENEWAL_NOTIFICATION'),
      renewal('RENEWAL_DUE', 'DUE'),
      renewal('RENEWAL_EXPIRED', 'EXPIRED'),
    ];

    it.each(events.map((e) => [e.event, e]))('handles %s', async (_name, body) => {
      const res = await post(body);
      expect(res.status).toBe(200);
    });

    it('acknowledges unknown events with 200', async () => {
      const res = await post({ event: 'SOMETHING_NEW', payload: {} });
      expect(res.status).toBe(200);
    });
  });

  describe('body validation', () => {
    it('returns 400 for invalid JSON (after authenticating)', async () => {
      const res = await post('not json');
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await post('[1,2,3]');
      expect(res.status).toBe(400);
    });

    it('returns 401 (not 400) for invalid JSON with a bad key', async () => {
      const res = await post('not json', { 'X-Api-Key': 'nope' });
      expect(res.status).toBe(401);
    });
  });
});
