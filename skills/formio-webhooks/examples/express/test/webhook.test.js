const request = require('supertest');

// Set test environment variables before importing the app
process.env.FORMIO_WEBHOOK_USERNAME = 'formio-test-user';
process.env.FORMIO_WEBHOOK_PASSWORD = 'p@ss:word/with:colons';

const app = require('../src/index');
const { verifyFormioRequest, parseBasicAuth } = require('../src/index');

const USER = process.env.FORMIO_WEBHOOK_USERNAME;
const PASS = process.env.FORMIO_WEBHOOK_PASSWORD;

const basic = (user, pass) => 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
const GOOD = basic(USER, PASS);

// Default payload shape from the Form.io docs: { request, response, submission, params }
function samplePayload() {
  const data = { textField: 'Test value', number: 12345, submit: true };
  return {
    request: { data, state: 'submitted', form: '62a745944e836ccf1c0ba167' },
    response: {},
    submission: { _id: '62e052a316f1ad4f786d4038', data, state: 'submitted' },
    params: { formId: '62a745944e836ccf1c0ba167' },
  };
}

function send(method, auth = GOOD, { body = JSON.stringify(samplePayload()), type = 'application/json' } = {}) {
  let req = request(app)[method]('/webhooks/formio');
  if (auth !== null) req = req.set('Authorization', auth);
  if (body !== undefined) req = req.set('Content-Type', type).send(body);
  return req;
}

describe('Form.io webhook endpoint', () => {
  describe('HTTP Basic authentication', () => {
    it('accepts the correct credentials', async () => {
      const res = await send('post');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true, operation: 'create' });
    });

    it('accepts a lowercase scheme', async () => {
      const res = await send('post', GOOD.replace('Basic', 'basic'));
      expect(res.status).toBe(200);
    });

    it('splits on the first colon only (password contains colons)', () => {
      const creds = parseBasicAuth(GOOD);
      expect(creds.username.toString()).toBe(USER);
      expect(creds.password.toString()).toBe(PASS);
    });

    it('rejects a wrong password', async () => {
      expect((await send('post', basic(USER, 'wrong'))).status).toBe(401);
    });

    it('rejects a wrong username', async () => {
      expect((await send('post', basic('someone', PASS))).status).toBe(401);
    });

    it('rejects when both are wrong', async () => {
      expect((await send('post', basic('a', 'b'))).status).toBe(401);
    });

    it('rejects credentials of a different length without throwing', async () => {
      expect((await send('post', basic('x', 'y'))).status).toBe(401);
    });

    it('rejects a missing Authorization header', async () => {
      const res = await send('post', null);
      expect(res.status).toBe(401);
      expect(res.headers['www-authenticate']).toMatch(/^Basic/);
    });

    it('rejects a non-Basic scheme', async () => {
      expect((await send('post', `Bearer ${PASS}`)).status).toBe(401);
    });

    it('rejects a malformed header (no colon after decoding)', async () => {
      const bad = 'Basic ' + Buffer.from('nocolon').toString('base64');
      expect((await send('post', bad)).status).toBe(401);
    });

    it('rejects garbage after the scheme', async () => {
      expect((await send('post', 'Basic !!!not-base64!!!')).status).toBe(401);
    });

    it('rejects everything when credentials are not configured', () => {
      expect(verifyFormioRequest({ authorization: GOOD }, '', '')).toBe(false);
      expect(verifyFormioRequest({ authorization: basic('', '') }, '', '')).toBe(false);
      expect(verifyFormioRequest({ authorization: GOOD }, USER, '')).toBe(false);
    });

    it('authenticates before parsing the body', async () => {
      const res = await send('post', null, { body: 'not json' });
      expect(res.status).toBe(401);
    });
  });

  describe('HTTP methods', () => {
    it.each([
      ['post', 'create'],
      ['put', 'update'],
      ['patch', 'update'],
      ['delete', 'delete'],
    ])('%s maps to %s', async (method, operation) => {
      const res = await send(method);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true, operation });
    });

    it('accepts GET with no body', async () => {
      const res = await send('get', GOOD, { body: undefined });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true, operation: 'read' });
    });

    it('accepts DELETE with no body and params in the query string', async () => {
      const res = await request(app)
        .delete('/webhooks/formio?submissionId=62e052a316f1ad4f786d4038')
        .set('Authorization', GOOD);
      expect(res.status).toBe(200);
      expect(res.body.operation).toBe('delete');
    });

    it('rejects an unauthenticated GET', async () => {
      expect((await send('get', null, { body: undefined })).status).toBe(401);
    });

    it('rejects methods outside the allowed set', async () => {
      const res = await request(app).options('/webhooks/formio').set('Authorization', GOOD);
      expect(res.status).toBe(405);
    });
  });

  describe('body handling', () => {
    it('accepts a JSON body sent with a non-JSON content type', async () => {
      const res = await send('post', GOOD, { type: 'text/plain' });
      expect(res.status).toBe(200);
    });

    it('rejects invalid JSON after authentication', async () => {
      expect((await send('post', GOOD, { body: '{oops' })).status).toBe(400);
    });

    it('rejects a JSON array', async () => {
      expect((await send('post', GOOD, { body: '[1,2]' })).status).toBe(400);
    });

    it('accepts a payload with no submission', async () => {
      const res = await send('put', GOOD, { body: '{}' });
      expect(res.status).toBe(200);
    });
  });

  it('serves /health without authentication', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
