const request = require('supertest');

// Set test environment variables before importing the app
process.env.COPPER_WEBHOOK_HEADER = 'X-Webhook-Secret';
process.env.COPPER_WEBHOOK_SECRET = 'test_copper_secret_0123456789';

const app = require('../src/index');
const { verifyCopperRequest } = require('../src/index');

const SECRET = process.env.COPPER_WEBHOOK_SECRET;
const HEADER = 'X-Webhook-Secret';

const TYPES = ['lead', 'person', 'company', 'opportunity', 'project', 'task', 'activity_log'];
const EVENTS = ['new', 'update', 'delete'];

function samplePayload(type = 'person', event = 'update') {
  return {
    ids: [12345, 12346],
    type,
    event,
    subscription_id: 987,
    updated_attributes: { title: ['Engineer', 'Senior Engineer'] },
    timestamp: '2021-12-13T19:18:22.084Z'
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/copper')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Copper webhook endpoint', () => {
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

    it('does not accept the secret from the JSON body', async () => {
      const res = await post(JSON.stringify({ ...samplePayload(), secret: SECRET }));
      expect(res.status).toBe(401);
    });

    it('compares the whole value, including a Bearer prefix', async () => {
      process.env.COPPER_WEBHOOK_SECRET = `Bearer ${SECRET}`;
      try {
        expect((await post().set(HEADER, `Bearer ${SECRET}`)).status).toBe(200);
        expect((await post().set(HEADER, SECRET)).status).toBe(401);
      } finally {
        process.env.COPPER_WEBHOOK_SECRET = SECRET;
      }
    });

    it('reads the header name from COPPER_WEBHOOK_HEADER', async () => {
      process.env.COPPER_WEBHOOK_HEADER = 'Authorization';
      try {
        expect((await post().set('Authorization', SECRET)).status).toBe(200);
        expect((await post().set(HEADER, SECRET)).status).toBe(401);
      } finally {
        process.env.COPPER_WEBHOOK_HEADER = HEADER;
      }
    });

    it('rejects everything when COPPER_WEBHOOK_SECRET is unset', () => {
      expect(verifyCopperRequest({ 'x-webhook-secret': SECRET }, '')).toBe(false);
      delete process.env.COPPER_WEBHOOK_SECRET;
      expect(verifyCopperRequest({ 'x-webhook-secret': SECRET })).toBe(false);
      process.env.COPPER_WEBHOOK_SECRET = SECRET;
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

    it('returns 400 for a body without ids, type and event', async () => {
      const res = await post('{"foo":1}').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    const combos = TYPES.flatMap((t) => EVENTS.map((e) => [t, e]));

    it.each(combos)('handles %s.%s', async (type, event) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload(type, event))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown types', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload('widget', 'new'))).set(HEADER, SECRET);
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
