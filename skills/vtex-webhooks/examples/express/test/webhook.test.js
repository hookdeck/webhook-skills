const request = require('supertest');

// Set test environment variables before importing the app
process.env.VTEX_WEBHOOK_HEADER = 'X-Webhook-Secret';
process.env.VTEX_WEBHOOK_SECRET = 'test_vtex_secret_0123456789';

const app = require('../src/index');
const { verifyVtexRequest } = require('../src/index');

const HEADER = process.env.VTEX_WEBHOOK_HEADER;
const SECRET = process.env.VTEX_WEBHOOK_SECRET;

const STATES = [
  'order-created', 'on-order-completed', 'payment-pending', 'payment-approved',
  'waiting-ffmt-authorization', 'ready-for-handling', 'start-handling', 'handling',
  'invoiced', 'cancel', 'canceled'
];

function samplePayload(State = 'payment-approved') {
  return {
    Domain: 'Marketplace',
    OrderId: 'v40484048naf-01',
    State,
    LastChange: '2019-07-29T23:17:30.0617185Z',
    Origin: { Account: 'accountABC', Key: 'vtexappkey-keyEDF' }
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app).post('/webhooks/vtex').set('Content-Type', contentType).send(body);
}

describe('VTEX webhook endpoint', () => {
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

    it('compares the whole value and does not parse a Bearer prefix', async () => {
      const res = await post().set(HEADER, `Bearer ${SECRET}`);
      expect(res.status).toBe(401);
    });

    it('accepts a configured value that includes Bearer', () => {
      const headers = { authorization: 'Bearer abc123' };
      expect(verifyVtexRequest(headers, 'Authorization', 'Bearer abc123')).toBe(true);
      expect(verifyVtexRequest({ authorization: 'abc123' }, 'Authorization', 'Bearer abc123')).toBe(false);
    });

    it('reads the header name from VTEX_WEBHOOK_HEADER', () => {
      expect(verifyVtexRequest({ 'x-custom': SECRET }, 'X-Custom', SECRET)).toBe(true);
      expect(verifyVtexRequest({ 'x-custom': SECRET }, 'X-Webhook-Secret', SECRET)).toBe(false);
    });

    it('rejects everything when VTEX_WEBHOOK_SECRET is unset', () => {
      expect(verifyVtexRequest({ 'x-webhook-secret': SECRET }, HEADER, '')).toBe(false);
      delete process.env.VTEX_WEBHOOK_SECRET;
      expect(verifyVtexRequest({ 'x-webhook-secret': SECRET })).toBe(false);
      process.env.VTEX_WEBHOOK_SECRET = SECRET;
    });
  });

  describe('setup ping', () => {
    it('returns 200 to the hookConfig ping without headers', async () => {
      const res = await post(JSON.stringify({ hookConfig: 'ping' }));
      expect(res.status).toBe(200);
    });

    it('returns 200 to the ping with a wrong secret', async () => {
      const res = await post(JSON.stringify({ hookConfig: 'ping' })).set(HEADER, 'nope');
      expect(res.status).toBe(200);
    });

    it('does not dispatch the ping as an event', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await post(JSON.stringify({ hookConfig: 'ping' }));
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
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

    it('returns 401, not 400, for invalid JSON without the secret', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('event handling', () => {
    it.each(STATES)('handles %s', async (state) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload(state))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown states', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload('something-new'))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
