const request = require('supertest');

// Set test environment variables before importing the app
process.env.SPEECHMATICS_WEBHOOK_HEADER = 'Authorization';
process.env.SPEECHMATICS_WEBHOOK_SECRET = 'Bearer test_speechmatics_token_0123456789';

const app = require('../src/index');
const { verifySpeechmaticsRequest } = require('../src/index');

const NAME = process.env.SPEECHMATICS_WEBHOOK_HEADER;
const VALUE = process.env.SPEECHMATICS_WEBHOOK_SECRET;

const JOB_ID = 'r6sr3jlzjj';
const path = (status = 'success') => `/webhooks/speechmatics?id=${JOB_ID}&status=${status}`;

// A jobinfo body: the JSON Speechmatics sends when only `jobinfo` is requested
const jobinfo = JSON.stringify({ id: JOB_ID, type: 'transcription', created_at: '2021-07-19T09:02:17.283Z' });

function send(method, status, headers = {}, body, contentType) {
  let req = request(app)[method](path(status));
  if (contentType) req = req.set('Content-Type', contentType);
  for (const [k, v] of Object.entries(headers)) req = req.set(k, v);
  return body === undefined ? req : req.send(body);
}

describe('Speechmatics webhook endpoint', () => {
  describe('Auth header', () => {
    it('accepts the correct whole header value', async () => {
      const res = await send('post', 'success', { [NAME]: VALUE }, jobinfo, 'application/json');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await send('post', 'success', { [NAME.toLowerCase()]: VALUE }, jobinfo, 'application/json');
      expect(res.status).toBe(200);
    });

    it('compares the whole value: the token without the Bearer prefix is rejected', async () => {
      const res = await send('post', 'success', { [NAME]: VALUE.replace('Bearer ', '') }, jobinfo, 'application/json');
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await send('post', 'success', { [NAME]: 'x'.repeat(VALUE.length) }, jobinfo, 'application/json');
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await send('post', 'success', { [NAME]: 'short' }, jobinfo, 'application/json');
      expect(res.status).toBe(401);
    });

    it('rejects when the header is missing', async () => {
      const res = await send('post', 'success', {}, jobinfo, 'application/json');
      expect(res.status).toBe(401);
    });

    it('rejects the value sent under a different header name', async () => {
      const res = await send('post', 'success', { 'X-Other-Header': VALUE }, jobinfo, 'application/json');
      expect(res.status).toBe(401);
    });

    it('rejects an unauthenticated empty request', async () => {
      const res = await send('post', 'success');
      expect(res.status).toBe(401);
    });
  });

  describe('Methods and bodies', () => {
    it('accepts PUT as well as POST', async () => {
      const res = await send('put', 'success', { [NAME]: VALUE }, jobinfo, 'application/json');
      expect(res.status).toBe(200);
    });

    it('accepts an empty body (status-only notification)', async () => {
      const res = await send('post', 'success', { [NAME]: VALUE });
      expect(res.status).toBe(200);
    });

    it('accepts a plain text transcript', async () => {
      const res = await send('post', 'success', { [NAME]: VALUE }, '1\n00:00:00,000 --> 00:00:01,000\nHello\n', 'text/plain');
      expect(res.status).toBe(200);
    });

    it('accepts a multipart body without parsing it', async () => {
      const boundary = 'xBOUNDARYx';
      const body =
        `--${boundary}\r\nContent-Disposition: form-data; name="jobinfo"\r\nContent-Type: application/json\r\n\r\n${jobinfo}\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="data_file"; filename="a.wav"\r\nContent-Type: audio/wav\r\n\r\nRIFF\r\n` +
        `--${boundary}--\r\n`;
      const res = await send('post', 'success', { [NAME]: VALUE }, body, `multipart/form-data; boundary=${boundary}`);
      expect(res.status).toBe(200);
    });

    it('returns 400 for an invalid JSON body', async () => {
      const res = await send('post', 'success', { [NAME]: VALUE }, '{not json', 'application/json');
      expect(res.status).toBe(400);
    });

    it('returns 405 for other methods', async () => {
      const res = await send('get', 'success', { [NAME]: VALUE });
      expect(res.status).toBe(405);
      expect(res.headers.allow).toBe('POST, PUT');
    });
  });

  describe('Statuses', () => {
    it('handles success, error, fetch_error, trim_error and unknown statuses', async () => {
      for (const status of ['success', 'error', 'fetch_error', 'trim_error', 'something_new']) {
        const res = await send('post', status, { [NAME]: VALUE }, jobinfo, 'application/json');
        expect(res.status).toBe(200);
      }
    });
  });

  describe('verifySpeechmaticsRequest', () => {
    it('rejects everything when no secret is configured', () => {
      expect(verifySpeechmaticsRequest({ authorization: 'abc' }, {})).toBe(false);
      expect(verifySpeechmaticsRequest({ authorization: '' }, { SPEECHMATICS_WEBHOOK_SECRET: '' })).toBe(false);
    });

    it('defaults the header name to Authorization', () => {
      const config = { SPEECHMATICS_WEBHOOK_SECRET: 'Bearer s3cret' };
      expect(verifySpeechmaticsRequest({ authorization: 'Bearer s3cret' }, config)).toBe(true);
    });

    it('uses a custom header name', () => {
      const config = { SPEECHMATICS_WEBHOOK_HEADER: 'X-SM-Token', SPEECHMATICS_WEBHOOK_SECRET: 's3cret' };
      expect(verifySpeechmaticsRequest({ 'x-sm-token': 's3cret' }, config)).toBe(true);
      expect(verifySpeechmaticsRequest({ authorization: 's3cret' }, config)).toBe(false);
    });
  });

  describe('GET /health', () => {
    it('returns ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });
});
