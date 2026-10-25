const request = require('supertest');

// Set test environment variables before importing the app
process.env.TRIPLETEX_WEBHOOK_HEADER = 'X-Tripletex-Auth';
process.env.TRIPLETEX_WEBHOOK_SECRET = 'Bearer test_tripletex_secret_0123456789';

const app = require('../src/index');
const { verifyTripletexRequest } = require('../src/index');

const HEADER = process.env.TRIPLETEX_WEBHOOK_HEADER;
const SECRET = process.env.TRIPLETEX_WEBHOOK_SECRET;

const OBJECTS = [
  'supplier', 'employee', 'order', 'product', 'account', 'project',
  'customer', 'contact', 'archiverelation', 'voucher'
];
const EVENTS = [
  'invoice.charged',
  ...OBJECTS.flatMap((o) => ['create', 'update', 'delete'].map((v) => `${o}.${v}`)),
  'notification.sent',
  'voucherstatus.ready',
  'closegroup.create',
  'closegroup.delete'
];

function samplePayload(event = 'product.create') {
  const isDelete = event.endsWith('.delete');
  return {
    subscriptionId: 42,
    event,
    id: 1001,
    value: isDelete ? null : { id: 1001, version: 3, name: 'Consulting hour' }
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/tripletex')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Tripletex webhook endpoint', () => {
  describe('Authentication header', () => {
    it('accepts the correct header value', async () => {
      const res = await post().set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set(HEADER.toLowerCase(), SECRET);
      expect(res.status).toBe(200);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await post().set(HEADER, 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await post().set(HEADER, 'short');
      expect(res.status).toBe(401);
    });

    it('compares the whole value: the secret without its Bearer prefix is rejected', async () => {
      const res = await post().set(HEADER, SECRET.replace('Bearer ', ''));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('does not read a different header', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(401);
    });

    it('rejects everything when no secret is configured', () => {
      const headers = { 'x-tripletex-auth': SECRET };
      expect(verifyTripletexRequest(headers, '', HEADER)).toBe(false);
      expect(verifyTripletexRequest(headers, SECRET, HEADER)).toBe(true);
    });

    it('defaults the header name to Authorization', () => {
      const saved = process.env.TRIPLETEX_WEBHOOK_HEADER;
      delete process.env.TRIPLETEX_WEBHOOK_HEADER;
      expect(verifyTripletexRequest({ authorization: SECRET })).toBe(true);
      expect(verifyTripletexRequest({ 'x-tripletex-auth': SECRET })).toBe(false);
      process.env.TRIPLETEX_WEBHOOK_HEADER = saved;
    });
  });

  describe('Body handling', () => {
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

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (event) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload(event))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload('widget.explode'))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(true);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
