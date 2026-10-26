const request = require('supertest');

// Set test environment variables before importing the app
process.env.ONELOGIN_WEBHOOK_HEADER = 'X-Onelogin-Secret';
process.env.ONELOGIN_WEBHOOK_SECRET = 'Bearer test_onelogin_secret_0123456789';

const app = require('../src/index');
const { verifyOneLoginRequest, parseEvents } = require('../src/index');

const HEADER = process.env.ONELOGIN_WEBHOOK_HEADER;
const SECRET = process.env.ONELOGIN_WEBHOOK_SECRET;

const EVENT_TYPE_IDS = [5, 6, 7, 8, 11, 22];

function sampleEvent(eventTypeId = 5) {
  return {
    event_type_id: eventTypeId,
    account_id: 92920,
    user_id: 32916209,
    user_name: 'John Richards',
    ipaddr: '125.236.219.21',
    app_name: null,
    risk_score: null,
    uuid: 'd210df80-ede8-42ba-8199-00ce951bc222',
    event_timestamp: '2017-12-05 19:13:06 UTC'
  };
}

function post(body = JSON.stringify([sampleEvent()]), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/onelogin')
    .set('Content-Type', contentType)
    .send(body);
}

describe('OneLogin webhook endpoint', () => {
  describe('custom header authentication', () => {
    it('accepts the exact header value', async () => {
      const res = await post().set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: 1 });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set(HEADER.toLowerCase(), SECRET);
      expect(res.status).toBe(200);
    });

    it('compares the whole value: does not strip a Bearer prefix', async () => {
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

    it('rejects the secret sent under a different header name', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(401);
    });

    it('rejects everything when the secret is unset', () => {
      const headers = { 'x-onelogin-secret': SECRET };
      expect(verifyOneLoginRequest(headers, '', HEADER)).toBe(false);
      expect(verifyOneLoginRequest(headers, SECRET, HEADER)).toBe(true);
    });

    it('defaults the header name to Authorization', () => {
      delete process.env.ONELOGIN_WEBHOOK_HEADER;
      expect(verifyOneLoginRequest({ authorization: SECRET })).toBe(true);
      process.env.ONELOGIN_WEBHOOK_HEADER = HEADER;
    });
  });

  describe('body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify([sampleEvent()]), 'text/plain').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('iterates every event in the array', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const body = JSON.stringify([sampleEvent(5), sampleEvent(6), sampleEvent(7)]);
      const res = await post(body).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: 3 });
      expect(spy).toHaveBeenCalledTimes(3);
      spy.mockRestore();
    });

    it('returns 400 for newline-delimited events (only the JSON Array format is documented)', async () => {
      const body = [sampleEvent(5), sampleEvent(6)].map((e) => JSON.stringify(e)).join('\n');
      const res = await post(body, 'text/plain').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for an array of non-objects', async () => {
      const res = await post('[1,2]').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });

    it('parseEvents handles array, single object and bad input', () => {
      expect(parseEvents('[{"a":1}]')).toEqual([{ a: 1 }]);
      expect(parseEvents('{"a":1}')).toEqual([{ a: 1 }]);
      expect(parseEvents('')).toBeNull();
      expect(parseEvents('nope')).toBeNull();
    });
  });

  describe('event handling', () => {
    it.each(EVENT_TYPE_IDS)('handles event_type_id %i', async (id) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify([sampleEvent(id)])).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown event types', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify([sampleEvent(999)])).set(HEADER, SECRET);
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
