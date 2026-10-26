const request = require('supertest');

// Set test environment variables before importing the app
process.env.SAP_SUCCESSFACTORS_WEBHOOK_USERNAME = 'sf_integration';
process.env.SAP_SUCCESSFACTORS_WEBHOOK_PASSWORD = 'p@ss:word-with-colon';

const app = require('../src/index');
const { verifySapSuccessFactorsRequest, parseBasicAuth } = require('../src/index');

const USER = process.env.SAP_SUCCESSFACTORS_WEBHOOK_USERNAME;
const PASS = process.env.SAP_SUCCESSFACTORS_WEBHOOK_PASSWORD;

function basic(user = USER, pass = PASS, scheme = 'Basic') {
  return `${scheme} ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

// Illustrative payload: SAP SuccessFactors sends whatever fields the integration maps.
const JSON_BODY = JSON.stringify({ userId: 'example-1001', firstName: 'Ada', department: 'Engineering' });
const XML_BODY = '<Employee><userId>example-1001</userId></Employee>';

function post(auth, body = JSON_BODY, contentType = 'application/json') {
  const req = request(app).post('/webhooks/sap-successfactors').set('Content-Type', contentType);
  if (auth) req.set('Authorization', auth);
  return req.send(body);
}

describe('SAP SuccessFactors webhook endpoint', () => {
  describe('Basic authentication', () => {
    it('accepts the correct credentials', async () => {
      const res = await post(basic());
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true, format: 'json' });
    });

    it('accepts the scheme in any case', async () => {
      expect((await post(basic(USER, PASS, 'basic'))).status).toBe(200);
      expect((await post(basic(USER, PASS, 'BASIC'))).status).toBe(200);
    });

    it('splits on the first colon only', () => {
      expect(parseBasicAuth(basic('a', 'b:c:d'))).toEqual({ username: 'a', password: 'b:c:d' });
    });

    it('rejects a wrong password', async () => {
      expect((await post(basic(USER, 'wrong'))).status).toBe(401);
    });

    it('rejects a wrong username', async () => {
      expect((await post(basic('someone', PASS))).status).toBe(401);
    });

    it('rejects when both are wrong', async () => {
      expect((await post(basic('x', 'y'))).status).toBe(401);
    });

    it('rejects a missing Authorization header', async () => {
      expect((await post()).status).toBe(401);
    });

    it('rejects other schemes', async () => {
      expect((await post(`Bearer ${PASS}`)).status).toBe(401);
    });

    it('rejects credentials followed by junk', async () => {
      expect((await post(`${basic()}!!`)).status).toBe(401);
      expect((await post(`${basic()} extra`)).status).toBe(401);
    });

    it('rejects non-base64 characters and missing colon', async () => {
      expect((await post('Basic not*base64')).status).toBe(401);
      expect((await post(`Basic ${Buffer.from('nocolon').toString('base64')}`)).status).toBe(401);
    });

    it('rejects when credentials are not configured', () => {
      expect(verifySapSuccessFactorsRequest({ authorization: basic('', '') }, '', '')).toBe(false);
      expect(verifySapSuccessFactorsRequest({ authorization: basic() }, null, null)).toBe(false);
    });

    it('does not throw on non-ASCII credentials', async () => {
      expect((await post(basic('üser', 'pässword'))).status).toBe(401);
    });
  });

  describe('methods and bodies', () => {
    it('accepts GET with no body', async () => {
      const res = await request(app).get('/webhooks/sap-successfactors').set('Authorization', basic());
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true, format: 'empty' });
    });

    it('rejects an unauthenticated GET', async () => {
      expect((await request(app).get('/webhooks/sap-successfactors')).status).toBe(401);
    });

    it('rejects other methods with 405', async () => {
      const res = await request(app).put('/webhooks/sap-successfactors').set('Authorization', basic());
      expect(res.status).toBe(405);
    });

    it('accepts an empty POST body', async () => {
      const res = await post(basic(), '');
      expect(res.status).toBe(200);
      expect(res.body.format).toBe('empty');
    });

    it('keeps XML as text', async () => {
      const res = await post(basic(), XML_BODY, 'application/xml');
      expect(res.status).toBe(200);
      expect(res.body.format).toBe('xml');
    });

    it('accepts +json content types', async () => {
      const res = await post(basic(), JSON_BODY, 'application/vnd.sap+json');
      expect(res.body.format).toBe('json');
    });

    it('accepts an unknown content type as text', async () => {
      const res = await post(basic(), 'a,b,c', 'text/csv');
      expect(res.body.format).toBe('text');
    });

    it('returns 400 for malformed JSON when the content type says JSON', async () => {
      expect((await post(basic(), '{oops')).status).toBe(400);
    });

    it('authenticates before parsing (bad JSON + bad auth is 401)', async () => {
      expect((await post(basic(USER, 'wrong'), '{oops')).status).toBe(401);
    });
  });

  it('serves /health without credentials', async () => {
    expect((await request(app).get('/health')).status).toBe(200);
  });
});
