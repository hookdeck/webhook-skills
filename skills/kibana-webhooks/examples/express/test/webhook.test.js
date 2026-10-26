const request = require('supertest');

const USERNAME = 'kibana_user';
const PASSWORD = 'p@ss:word:with:colons';

process.env.KIBANA_WEBHOOK_USERNAME = USERNAME;
process.env.KIBANA_WEBHOOK_PASSWORD = PASSWORD;

const app = require('../src/index');

const basic = (user, pass) =>
  'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');

// Illustrative rule action template output (not a vendor schema)
const FIRED = { rule: 'High CPU', status: 'query matched', context: 'CPU above 90%' };
const RECOVERED = { rule: 'High CPU', status: 'recovered', context: 'CPU back to normal' };

const send = (method, headers = {}, body) => {
  const req = request(app)[method.toLowerCase()]('/webhooks/kibana').set(headers);
  return body === undefined ? req : req.set('Content-Type', 'application/json').send(body);
};

describe('Kibana webhook endpoint', () => {
  describe('Basic authentication', () => {
    it('accepts valid credentials', async () => {
      const res = await send('POST', { Authorization: basic(USERNAME, PASSWORD) }, JSON.stringify(FIRED));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('accepts the scheme in any case', async () => {
      const header = basic(USERNAME, PASSWORD).replace('Basic', 'bAsIc');
      const res = await send('POST', { Authorization: header }, JSON.stringify(FIRED));
      expect(res.status).toBe(200);
    });

    it('splits on the first colon so passwords may contain colons', async () => {
      const res = await send('POST', { Authorization: basic(USERNAME, PASSWORD) }, JSON.stringify(RECOVERED));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong password', async () => {
      const res = await send('POST', { Authorization: basic(USERNAME, 'wrong') }, JSON.stringify(FIRED));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong username', async () => {
      const res = await send('POST', { Authorization: basic('other', PASSWORD) }, JSON.stringify(FIRED));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await send('POST', {}, JSON.stringify(FIRED));
      expect(res.status).toBe(401);
    });

    it('rejects a non-Basic scheme', async () => {
      const res = await send('POST', { Authorization: 'Bearer abc' }, JSON.stringify(FIRED));
      expect(res.status).toBe(401);
    });

    it('rejects malformed base64', async () => {
      const res = await send('POST', { Authorization: 'Basic !!!not-base64!!!' }, JSON.stringify(FIRED));
      expect(res.status).toBe(401);
    });

    it('rejects valid credentials followed by junk', async () => {
      const header = basic(USERNAME, PASSWORD) + '!!!!';
      const res = await send('POST', { Authorization: header }, JSON.stringify(FIRED));
      expect(res.status).toBe(401);
    });

    it('rejects credentials without a colon', async () => {
      const header = 'Basic ' + Buffer.from('nocolon').toString('base64');
      const res = await send('POST', { Authorization: header }, JSON.stringify(FIRED));
      expect(res.status).toBe(401);
    });

    it('does not send a WWW-Authenticate challenge', async () => {
      const res = await send('POST', {}, JSON.stringify(FIRED));
      expect(res.headers['www-authenticate']).toBeUndefined();
    });

    it('rejects everything when credentials are not configured', async () => {
      const { verifyBasicAuth } = app;
      expect(verifyBasicAuth(basic('', ''), '', '')).toBe(false);
      expect(verifyBasicAuth(basic(USERNAME, PASSWORD), undefined, undefined)).toBe(false);
    });
  });

  describe('methods', () => {
    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('accepts %s with a JSON body', async (method) => {
      const res = await send(method, { Authorization: basic(USERNAME, PASSWORD) }, JSON.stringify(FIRED));
      expect(res.status).toBe(200);
    });

    it.each(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])('accepts %s with an empty body', async (method) => {
      const res = await send(method, { Authorization: basic(USERNAME, PASSWORD) });
      expect(res.status).toBe(200);
    });

    it.each(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])('checks the credential first for %s', async (method) => {
      const res = await send(method, { Authorization: basic(USERNAME, 'wrong') });
      expect(res.status).toBe(401);
    });
  });

  describe('body handling', () => {
    it('keeps non-JSON text', async () => {
      const res = await request(app)
        .post('/webhooks/kibana')
        .set('Authorization', basic(USERNAME, PASSWORD))
        .set('Content-Type', 'text/plain')
        .send('Rule High CPU fired');
      expect(res.status).toBe(200);
    });

    it('accepts any content type', async () => {
      const res = await request(app)
        .post('/webhooks/kibana')
        .set('Authorization', basic(USERNAME, PASSWORD))
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('rule=High+CPU');
      expect(res.status).toBe(200);
    });

    it('handles a JSON array without crashing', async () => {
      const res = await send('POST', { Authorization: basic(USERNAME, PASSWORD) }, '[1,2]');
      expect(res.status).toBe(200);
    });
  });

  it('serves a health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
