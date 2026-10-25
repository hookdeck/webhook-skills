const request = require('supertest');

// Set test environment variables before importing the app
process.env.RAPIDAPI_WEBHOOK_SECRET = 'test_rapidapi_secret_0123456789';
process.env.RAPIDAPI_EVENT_FIELD = 'eventType'; // illustrative field name

const app = require('../src/index');
const { verifyRapidApiRequest } = require('../src/index');

const SECRET = process.env.RAPIDAPI_WEBHOOK_SECRET;
const HEADER = 'x-rapidapi-webhook-secret';

const EVENTS = [
  'API Created', 'API Updated', 'API Deleted', 'Subscription Created',
  'Subscription Updated', 'User Created', 'Billing Plan Updated'
];

// Illustrative payload: RapidAPI does not document the body format.
function samplePayload(event = 'API Created') {
  return { eventType: event, data: { id: 'example-id' } };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/rapidapi')
    .set('Content-Type', contentType)
    .send(body);
}

describe('RapidAPI webhook endpoint', () => {
  describe('x-rapidapi-webhook-secret verification', () => {
    it('accepts the correct secret', async () => {
      const res = await post().set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('X-RapidAPI-Webhook-Secret', SECRET);
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

    it('rejects a prefix of the secret (whole value compared)', async () => {
      const res = await post().set(HEADER, SECRET.slice(0, -1));
      expect(res.status).toBe(401);
    });

    it('rejects a missing secret', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects everything when RAPIDAPI_WEBHOOK_SECRET is unset', () => {
      expect(verifyRapidApiRequest({ [HEADER]: SECRET }, '')).toBe(false);
      delete process.env.RAPIDAPI_WEBHOOK_SECRET;
      expect(verifyRapidApiRequest({ [HEADER]: SECRET })).toBe(false);
      process.env.RAPIDAPI_WEBHOOK_SECRET = SECRET;
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

    it('returns 401, not 400, for invalid JSON without a secret', async () => {
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

    it('acknowledges events it does not handle', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload('Team Updated'))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    it('acknowledges payloads when no event field is configured', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      delete process.env.RAPIDAPI_EVENT_FIELD;
      const res = await post().set(HEADER, SECRET);
      expect(res.status).toBe(200);
      process.env.RAPIDAPI_EVENT_FIELD = 'eventType';
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
