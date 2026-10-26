const request = require('supertest');

// Set test environment variables before importing the app
process.env.TANIUM_WEBHOOK_HEADER = 'X-Tanium-Secret';
process.env.TANIUM_WEBHOOK_SECRET = 'Bearer test_tanium_secret_0123456789';

const app = require('../src/index');
const { verifyTaniumRequest } = require('../src/index');

const HEADER = process.env.TANIUM_WEBHOOK_HEADER;
const SECRET = process.env.TANIUM_WEBHOOK_SECRET;

// Illustrative payload: Tanium has no event field. The real body is whatever the
// Connect connection is configured to send (source rows with the chosen columns).
const RECORDS = [
  { 'Computer Name': 'host-1.example.com', 'IP Address': '10.0.0.5', 'Operating System': 'Windows Server 2022' },
  { 'Computer Name': 'host-2.example.com', 'IP Address': '10.0.0.6', 'Operating System': 'Ubuntu 24.04' }
];

function send(method, body = JSON.stringify(RECORDS), contentType = 'application/json') {
  const req = request(app)[method]('/webhooks/tanium');
  if (contentType) req.set('Content-Type', contentType);
  return req.send(body);
}

describe('Tanium webhook endpoint', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Header authentication', () => {
    it('accepts the correct header value', async () => {
      const res = await send('post').set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await send('post').set(HEADER.toLowerCase(), SECRET);
      expect(res.status).toBe(200);
    });

    it('compares the whole value, prefix included', async () => {
      const res = await send('post').set(HEADER, SECRET.replace('Bearer ', ''));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await send('post').set(HEADER, 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await send('post').set(HEADER, 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a non-ASCII value without throwing', async () => {
      const res = await send('post').set(HEADER, Buffer.from('é'.repeat(SECRET.length), 'latin1').toString('latin1'));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await send('post');
      expect(res.status).toBe(401);
    });

    it('rejects the secret sent under a different header', async () => {
      const res = await send('post').set('Authorization', SECRET);
      expect(res.status).toBe(401);
    });

    it('rejects everything when the secret is unset', () => {
      const headers = { [HEADER.toLowerCase()]: SECRET };
      expect(verifyTaniumRequest(headers, '', HEADER)).toBe(false);
      expect(verifyTaniumRequest(headers, SECRET, HEADER)).toBe(true);
    });

    it('defaults the header name to Authorization', () => {
      const saved = process.env.TANIUM_WEBHOOK_HEADER;
      delete process.env.TANIUM_WEBHOOK_HEADER;
      expect(verifyTaniumRequest({ authorization: SECRET })).toBe(true);
      expect(verifyTaniumRequest({ [HEADER.toLowerCase()]: SECRET })).toBe(false);
      process.env.TANIUM_WEBHOOK_HEADER = saved;
    });
  });

  describe('Methods', () => {
    it.each(['post', 'put', 'patch'])('accepts %s', async (method) => {
      const res = await send(method).set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('authenticates PUT too', async () => {
      expect((await send('put')).status).toBe(401);
    });

    it('does not accept DELETE', async () => {
      const res = await request(app).delete('/webhooks/tanium').set(HEADER, SECRET);
      expect(res.status).not.toBe(200);
    });
  });

  describe('Body handling', () => {
    it('accepts a JSON array of records', async () => {
      const spy = jest.spyOn(console, 'log');
      const res = await send('post').set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy).toHaveBeenCalledWith('Received 2 record(s) from Tanium Connect');
    });

    it('accepts a single JSON object', async () => {
      const spy = jest.spyOn(console, 'log');
      const res = await send('post', JSON.stringify(RECORDS[0])).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy).toHaveBeenCalledWith('Received 1 record(s) from Tanium Connect');
    });

    it('accepts any content type (raw body)', async () => {
      const res = await send('post', JSON.stringify(RECORDS), 'text/plain').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts an empty body', async () => {
      const res = await send('post', '', null).set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await send('post', '{not json').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a scalar JSON body', async () => {
      const res = await send('post', '42').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await send('post', '{not json');
      expect(res.status).toBe(401);
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
