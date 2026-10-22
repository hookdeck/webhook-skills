const request = require('supertest');

// Set test environment variables before importing the app
process.env.ZUORA_WEBHOOK_USERNAME = 'zuora-callout';
process.env.ZUORA_WEBHOOK_PASSWORD = 'p@ss:w0rd:with:colons';

const app = require('../src/index');
const { verifyZuoraRequest, parseBasicAuth } = require('../src/index');

const USER = process.env.ZUORA_WEBHOOK_USERNAME;
const PASS = process.env.ZUORA_WEBHOOK_PASSWORD;

function basic(user = USER, pass = PASS, scheme = 'Basic') {
  return `${scheme} ${Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')}`;
}

const GOOD = basic();

// Illustrative body: Zuora adds no event field, the callout template defines the body.
function samplePayload(event = 'PaymentProcessed') {
  return { event, accountId: '2c92c0f8-0000-0000-0000-000000000001', invoiceNumber: 'INV00000123' };
}

function call(method = 'post', body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  const req = request(app)[method]('/webhooks/zuora');
  return body === null ? req : req.set('Content-Type', contentType).send(body);
}

describe('Zuora callout endpoint', () => {
  describe('Basic auth verification', () => {
    it('accepts correct credentials', async () => {
      const res = await call().set('Authorization', GOOD);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true, success: true });
    });

    it('matches the scheme case-insensitively', async () => {
      for (const scheme of ['basic', 'BASIC']) {
        const res = await call().set('Authorization', basic(USER, PASS, scheme));
        expect(res.status).toBe(200);
      }
    });

    it('splits on the first colon, so the password may contain colons', () => {
      const creds = parseBasicAuth(GOOD);
      expect(creds.username.toString()).toBe(USER);
      expect(creds.password.toString()).toBe(PASS);
    });

    it('accepts a non-ASCII password', async () => {
      process.env.ZUORA_WEBHOOK_PASSWORD = 'pässwörd-日本';
      const res = await call().set('Authorization', basic(USER, 'pässwörd-日本'));
      expect(res.status).toBe(200);
      process.env.ZUORA_WEBHOOK_PASSWORD = PASS;
    });

    it('rejects a wrong password', async () => {
      const res = await call().set('Authorization', basic(USER, 'wrong'));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong username', async () => {
      const res = await call().set('Authorization', basic('someone-else', PASS));
      expect(res.status).toBe(401);
    });

    it('rejects when both are wrong, including different lengths, without throwing', async () => {
      const res = await call().set('Authorization', basic('x', 'y'));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header and sends a Basic challenge', async () => {
      const res = await call();
      expect(res.status).toBe(401);
      expect(res.headers['www-authenticate']).toMatch(/^Basic/);
    });

    it('rejects malformed headers', async () => {
      const bad = [
        'Basic',
        'Basic ',
        `Bearer ${Buffer.from(`${USER}:${PASS}`).toString('base64')}`,
        'Basic !!!not-base64!!!',
        `Basic ${Buffer.from('no-colon-here').toString('base64')}`,
        `Basic ${Buffer.from(`${USER}:${PASS}`).toString('base64')} extra`,
        USER + ':' + PASS,
      ];
      for (const header of bad) {
        const res = await call().set('Authorization', header);
        expect(res.status).toBe(401);
      }
    });

    it('rejects everything when the credentials are unset', () => {
      const headers = { authorization: GOOD };
      expect(verifyZuoraRequest(headers, '', '')).toBe(false);
      expect(verifyZuoraRequest(headers, USER, '')).toBe(false);
      expect(verifyZuoraRequest(headers, '', PASS)).toBe(false);
      delete process.env.ZUORA_WEBHOOK_USERNAME;
      delete process.env.ZUORA_WEBHOOK_PASSWORD;
      expect(verifyZuoraRequest(headers)).toBe(false);
      process.env.ZUORA_WEBHOOK_USERNAME = USER;
      process.env.ZUORA_WEBHOOK_PASSWORD = PASS;
    });

    it('authenticates before parsing the body', async () => {
      const res = await call('post', '{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('HTTP methods', () => {
    it.each(['post', 'put', 'patch', 'delete'])('accepts %s with a JSON body', async (method) => {
      const res = await call(method).set('Authorization', GOOD);
      expect(res.status).toBe(200);
    });

    it('accepts GET with an empty body and reads merge fields from the query', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await request(app)
        .get('/webhooks/zuora?event=InvoicePosted&accountId=abc')
        .set('Authorization', GOOD);
      expect(res.status).toBe(200);
      expect(spy).toHaveBeenCalledWith('Invoice posted for account abc');
      spy.mockRestore();
    });

    it('accepts a POST with no body', async () => {
      const res = await request(app).post('/webhooks/zuora').set('Authorization', GOOD);
      expect(res.status).toBe(200);
    });

    it('rejects other methods with 405', async () => {
      const res = await request(app).options('/webhooks/zuora').set('Authorization', GOOD);
      expect(res.status).toBe(405);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type', async () => {
      for (const type of ['text/plain', 'application/octet-stream', 'application/vnd.api+json']) {
        const res = await call('post', JSON.stringify(samplePayload()), type).set('Authorization', GOOD);
        expect(res.status).toBe(200);
      }
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await call('post', '{not json').set('Authorization', GOOD);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a JSON body that is not an object', async () => {
      const res = await call('post', '[1,2]').set('Authorization', GOOD);
      expect(res.status).toBe(400);
    });

    it.each(['PaymentProcessed', 'InvoicePosted', 'SomethingElse'])('handles the %s event', async (event) => {
      const res = await call('post', JSON.stringify(samplePayload(event))).set('Authorization', GOOD);
      expect(res.status).toBe(200);
    });
  });

  it('serves /health without authentication', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
