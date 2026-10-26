const request = require('supertest');

// Set test environment variables before importing the app
process.env.PREFECT_WEBHOOK_HEADER = 'X-Prefect-Secret';
process.env.PREFECT_WEBHOOK_SECRET = 'Bearer test_prefect_secret_0123456789';

const app = require('../src/index');
const { verifyPrefectRequest } = require('../src/index');

const HEADER = process.env.PREFECT_WEBHOOK_HEADER;
const SECRET = process.env.PREFECT_WEBHOOK_SECRET;

// Illustrative template: {"subject": "{{subject}}", "body": "{{body}}", "name": "{{name}}"}
function samplePayload(subject = 'Flow run my-run entered state Failed') {
  return { subject, body: 'Flow run failed: boom', name: 'my-webhook-block' };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app).post('/webhooks/prefect').set('Content-Type', contentType).send(body);
}

describe('Prefect Custom Webhook endpoint', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  describe('credential verification', () => {
    it('accepts the exact header value', async () => {
      const res = await post().set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set(HEADER.toLowerCase(), SECRET);
      expect(res.status).toBe(200);
    });

    it('compares the whole value: the part after "Bearer " alone is rejected', async () => {
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

    it('ignores the secret under a different header name', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(401);
    });

    it('rejects everything when PREFECT_WEBHOOK_SECRET is unset', () => {
      const headers = { 'x-prefect-secret': SECRET };
      expect(verifyPrefectRequest(headers, '', HEADER)).toBe(false);
      delete process.env.PREFECT_WEBHOOK_SECRET;
      expect(verifyPrefectRequest(headers)).toBe(false);
      process.env.PREFECT_WEBHOOK_SECRET = SECRET;
    });

    it('defaults the header name to Authorization', () => {
      const saved = process.env.PREFECT_WEBHOOK_HEADER;
      delete process.env.PREFECT_WEBHOOK_HEADER;
      expect(verifyPrefectRequest({ authorization: SECRET })).toBe(true);
      process.env.PREFECT_WEBHOOK_HEADER = saved;
    });
  });

  describe('request methods', () => {
    it.each(['post', 'put', 'patch'])('accepts %s with a body', async (method) => {
      const res = await request(app)[method]('/webhooks/prefect')
        .set('Content-Type', 'application/json')
        .set(HEADER, SECRET)
        .send(JSON.stringify(samplePayload()));
      expect(res.status).toBe(200);
    });

    it('accepts GET with an empty body', async () => {
      const res = await request(app).get('/webhooks/prefect').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('authenticates GET too', async () => {
      const res = await request(app).get('/webhooks/prefect');
      expect(res.status).toBe(401);
    });
  });

  describe('body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts a form-encoded body (form_data template)', async () => {
      const res = await post('subject=Failed&body=boom&name=blk', 'application/x-www-form-urlencoded')
        .set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts an empty POST body', async () => {
      const res = await post('').set(HEADER, SECRET);
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

    it('returns 401, not 400, for invalid JSON without the credential', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('notification handling', () => {
    it('logs the substituted subject, body and name', async () => {
      const spy = jest.spyOn(console, 'log');
      const res = await post().set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).includes('my-webhook-block'))).toBe(true);
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
