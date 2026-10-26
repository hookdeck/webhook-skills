const request = require('supertest');

// Set test environment variables before importing the app
process.env.CLICKHOUSE_WEBHOOK_HEADER = 'X-ClickStack-Secret';
process.env.CLICKHOUSE_WEBHOOK_SECRET = 'Bearer test_clickhouse_secret_0123456789';

const app = require('../src/index');
const { verifyClickHouseRequest } = require('../src/index');

const HEADER = process.env.CLICKHOUSE_WEBHOOK_HEADER;
const SECRET = process.env.CLICKHOUSE_WEBHOOK_SECRET;

// Illustrative payload from the template {"title":"{{title}}","body":"{{body}}","link":"{{link}}"}
function samplePayload(title = 'High error rate') {
  return {
    title,
    body: 'Alert fired: error count >= 100 over 5m',
    link: 'https://clickstack.example.com/search/abc123',
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app).post('/webhooks/clickhouse').set('Content-Type', contentType).send(body);
}

describe('ClickHouse (ClickStack) webhook endpoint', () => {
  describe('secret header verification', () => {
    it('accepts the correct whole value', async () => {
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

    it('does not strip a Bearer prefix (whole-value compare)', async () => {
      const res = await post().set(HEADER, SECRET.replace(/^Bearer /, ''));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('ignores the secret in a different header', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(401);
    });

    it('defaults to the Authorization header', () => {
      expect(
        verifyClickHouseRequest({ authorization: 'Bearer abc' }, { CLICKHOUSE_WEBHOOK_SECRET: 'Bearer abc' })
      ).toBe(true);
      expect(
        verifyClickHouseRequest({ authorization: 'abc' }, { CLICKHOUSE_WEBHOOK_SECRET: 'Bearer abc' })
      ).toBe(false);
    });

    it('rejects everything when the secret is unset', () => {
      expect(verifyClickHouseRequest({ 'x-clickstack-secret': SECRET }, {})).toBe(false);
      expect(
        verifyClickHouseRequest({ 'x-clickstack-secret': '' }, { CLICKHOUSE_WEBHOOK_SECRET: '' })
      ).toBe(false);
    });
  });

  describe('body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts a non-JSON body as plain text', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post('High error rate - see link', 'text/plain').set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls[0][0]).toContain('High error rate - see link');
      spy.mockRestore();
    });

    it('accepts an empty body', async () => {
      const res = await post('', 'text/plain').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 401, not 200, for a bad body without the header', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });

    it('logs the title, body and link from a JSON template', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post().set(HEADER, SECRET);
      expect(res.status).toBe(200);
      const line = String(spy.mock.calls[0][0]);
      expect(line).toContain('High error rate');
      expect(line).toContain('https://clickstack.example.com/search/abc123');
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
