const request = require('supertest');

// Set test environment variables before importing the app
process.env.TIMIFY_WEBHOOK_SECRET = 'Bearer test_timify_secret_0123456789';
delete process.env.TIMIFY_WEBHOOK_HEADER; // default: Authorization

const app = require('../src/index');
const { verifyTimifyRequest } = require('../src/index');

const SECRET = process.env.TIMIFY_WEBHOOK_SECRET;

// Webhook names and types from TIMIFY's scope table (Sync webhooks are not supported).
const WEBHOOKS = [
  ['Customers', 'Created'], ['Customers', 'Updated'], ['Customers', 'Deleted'],
  ['Event', 'Created'], ['Event', 'Updated'], ['Event', 'Deleted'],
  ['Events', 'Deleted'],
  ['Services', 'Created'], ['Services', 'Updated'], ['Services', 'Deleted'],
  ['Resource', 'Created'], ['Resource', 'Updated'], ['Resource', 'Deleted'],
  ['Company', 'Created'], ['Company', 'Updated'], ['Company', 'Deleted'],
  ['Manager', 'Created'], ['Manager', 'Updated'], ['Manager', 'Deleted'],
  ['Enterprise', 'Updated'],
  ['Customer Fields', 'Created'], ['Customer Fields', 'Updated'], ['Customer Fields', 'Deleted'],
  ['Shift', 'Created'], ['Shift', 'Updated'], ['Shift', 'Deleted'],
  ['Notification', 'Created'],
  ['Service Groups', 'Created'], ['Service Groups', 'Updated'], ['Service Groups', 'Deleted'],
];

// ILLUSTRATIVE payload: TIMIFY's overview page does not document the field names.
function samplePayload(webhook = 'Event', type = 'Created') {
  return { webhook, type, data: { id: 'evt_123', start: '2026-10-26T09:00:00Z' } };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/timify')
    .set('Content-Type', contentType)
    .send(body);
}

describe('TIMIFY webhook endpoint', () => {
  describe('Header authentication', () => {
    it('accepts the whole header value, including the Bearer prefix', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('does not strip a Bearer prefix from either side', async () => {
      const res = await post().set('Authorization', SECRET.replace('Bearer ', ''));
      expect(res.status).toBe(401);
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('authORIZATION', SECRET);
      expect(res.status).toBe(200);
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

    it('rejects everything when TIMIFY_WEBHOOK_SECRET is unset', () => {
      expect(verifyTimifyRequest({ authorization: SECRET }, '')).toBe(false);
      delete process.env.TIMIFY_WEBHOOK_SECRET;
      expect(verifyTimifyRequest({ authorization: SECRET })).toBe(false);
      process.env.TIMIFY_WEBHOOK_SECRET = SECRET;
    });

    describe('with a custom header name', () => {
      beforeAll(() => { process.env.TIMIFY_WEBHOOK_HEADER = 'X-Timify-Secret'; });
      afterAll(() => { delete process.env.TIMIFY_WEBHOOK_HEADER; });

      it('reads the header named by TIMIFY_WEBHOOK_HEADER', async () => {
        const res = await post().set('x-timify-secret', SECRET);
        expect(res.status).toBe(200);
      });

      it('ignores the default Authorization header', async () => {
        const res = await post().set('Authorization', SECRET);
        expect(res.status).toBe(401);
      });
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain')
        .set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await post('[1,2]').set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(WEBHOOKS)('handles %s %s', async (webhook, type) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload(webhook, type))).set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unrecognised payloads', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify({ something: 'else' })).set('Authorization', SECRET);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
