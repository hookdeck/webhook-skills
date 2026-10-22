const request = require('supertest');

// Set test environment variables before importing the app
process.env.STUART_WEBHOOK_HEADER = 'X-Webhook-Secret';
process.env.STUART_WEBHOOK_SECRET = 'Bearer test_stuart_key_0123456789';

const app = require('../src/index');
const { verifyStuartRequest } = require('../src/index');

const HEADER = process.env.STUART_WEBHOOK_HEADER;
const SECRET = process.env.STUART_WEBHOOK_SECRET;

const TOPICS = [
  'package_created', 'courier_assigned', 'courier_arriving', 'package_split', 'courier_waiting',
  'package_delivering', 'package_delivered', 'package_canceled', 'package_returning',
  'package_returned', 'courier_reassigning', 'courier_moving'
];

function samplePayload(topic = 'package_created') {
  return {
    version: 'v3',
    occurred_at: '2023-02-13T15:29:36.000+01:00',
    event_id: '93ce4c52-5b27-4cec-9baf-68cfcdd4da46',
    webhook_id: 2359,
    topic,
    details: {
      account: { id: 451871 },
      package: { id: '10000000001', reference: '1676298576' }
    }
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/stuart')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Stuart webhook endpoint', () => {
  describe('authentication header verification', () => {
    it('accepts the correct value', async () => {
      const res = await post().set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set(HEADER.toLowerCase(), SECRET);
      expect(res.status).toBe(200);
    });

    it('compares the whole value, including the Bearer prefix', async () => {
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

    it('ignores the secret sent under a different header', async () => {
      const res = await post().set('X-Other', SECRET);
      expect(res.status).toBe(401);
    });

    it('rejects everything when STUART_WEBHOOK_SECRET is unset', () => {
      const headers = { 'x-webhook-secret': SECRET };
      expect(verifyStuartRequest(headers, HEADER, '')).toBe(false);
      expect(verifyStuartRequest(headers, HEADER, SECRET)).toBe(true);
    });

    it('uses a custom header name', () => {
      expect(verifyStuartRequest({ 'x-stuart-auth': 'k' }, 'X-Stuart-Auth', 'k')).toBe(true);
      expect(verifyStuartRequest({ 'x-stuart-auth': 'k' }, 'X-Webhook-Secret', 'k')).toBe(false);
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
    it.each(TOPICS)('handles %s', async (topic) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload(topic))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown topics', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload('something_new'))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    it('tolerates a payload without details', async () => {
      const res = await post(JSON.stringify({ topic: 'package_created' })).set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
