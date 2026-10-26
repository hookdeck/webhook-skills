const request = require('supertest');

// Set test environment variables before importing the app
process.env.VENTRATA_WEBHOOK_HEADER = 'X-Webhook-Secret';
process.env.VENTRATA_WEBHOOK_SECRET = 'whsec_123456abcdef';

const app = require('../src/index');
const { verifyVentrataRequest, normalizeEvent } = require('../src/index');

const HEADER = process.env.VENTRATA_WEBHOOK_HEADER;
const SECRET = process.env.VENTRATA_WEBHOOK_SECRET;

const EVENTS = [
  'order_update', 'booking_update', 'availability_update', 'product_update',
  'order.updated', 'booking.updated', 'availability.updated', 'product.updated',
];

function samplePayload(event = 'booking.updated') {
  return {
    event,
    webhook: { id: 'webhook_booking_update', event, url: 'https://example.com/webhooks/ventrata' },
    supplier: { id: '3d6f0a3a-59d4-4b16-a0c5-11d2d8a4e6b7', name: 'City Sightseeing Group' },
    order: { orderId: 'ord_20260514_9f3c21', status: 'ON_HOLD' },
    booking: { uuid: '89fe0192-ddcd-430a-b285-e1396a4725d2', status: 'ON_HOLD' },
    product: { id: 'e7cc8bb4-8d1c-4848-8824-5dbedb718681', internalName: 'Walking Tour of Barcelona' },
    availability: { id: '94cdd032-3d32-416d-b0a4-abf8b7495b8b', available: true },
    diff: [{ op: 'add', path: 'path-example', was: 'was-example', value: 'value-example' }],
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/ventrata')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Ventrata webhook endpoint', () => {
  describe('secret header verification', () => {
    it('accepts the correct secret', async () => {
      const res = await post().set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('x-webhook-secret', SECRET);
      expect(res.status).toBe(200);
    });

    it('rejects a wrong secret of the same length', async () => {
      const res = await post().set(HEADER, 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a secret of a different length without throwing', async () => {
      const res = await post().set(HEADER, 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects the secret sent under a different header name', async () => {
      const res = await post().set('X-Other-Header', SECRET);
      expect(res.status).toBe(401);
    });

    it('rejects everything when VENTRATA_WEBHOOK_SECRET is unset', () => {
      expect(verifyVentrataRequest({ 'x-webhook-secret': SECRET }, '')).toBe(false);
      expect(verifyVentrataRequest({ 'x-webhook-secret': SECRET }, undefined)).toBe(true);
      delete process.env.VENTRATA_WEBHOOK_SECRET;
      expect(verifyVentrataRequest({ 'x-webhook-secret': SECRET })).toBe(false);
      process.env.VENTRATA_WEBHOOK_SECRET = SECRET;
    });

    it('reads a custom header name', () => {
      expect(verifyVentrataRequest({ 'x-ventrata-key': 'abc' }, 'abc', 'X-Ventrata-Key')).toBe(true);
      expect(verifyVentrataRequest({ 'x-webhook-secret': 'abc' }, 'abc', 'X-Ventrata-Key')).toBe(false);
    });

    it('compares the whole value, including a Bearer prefix', () => {
      const secret = 'Bearer abc123';
      expect(verifyVentrataRequest({ authorization: 'Bearer abc123' }, secret, 'Authorization')).toBe(true);
      expect(verifyVentrataRequest({ authorization: 'abc123' }, secret, 'Authorization')).toBe(false);
      expect(verifyVentrataRequest({ authorization: 'Bearer abc123' }, 'abc123', 'Authorization')).toBe(false);
    });

    it('handles non-ASCII values without throwing', () => {
      expect(verifyVentrataRequest({ 'x-webhook-secret': 'sécret' }, 'sécret')).toBe(true);
      expect(verifyVentrataRequest({ 'x-webhook-secret': 'secret' }, 'sécret')).toBe(false);
    });
  });

  describe('body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set(HEADER, SECRET);
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

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('event handling', () => {
    it.each(EVENTS)('handles %s', async (event) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload(event))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('normalizes both spellings to the same event', () => {
      expect(normalizeEvent('booking.updated')).toBe('booking_update');
      expect(normalizeEvent('booking_update')).toBe('booking_update');
      expect(normalizeEvent('something_new')).toBe('something_new');
    });

    it('acknowledges unknown events', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload('something_new'))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
