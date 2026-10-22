const request = require('supertest');

// Set test environment variables before importing the app
process.env.KOBOTOOLBOX_WEBHOOK_USERNAME = 'kobo-hook';
process.env.KOBOTOOLBOX_WEBHOOK_PASSWORD = 'p@ss:word/with:colons';

const app = require('../src/index');
const { verifyKoboRequest, parseBasicAuth } = require('../src/index');

const USER = process.env.KOBOTOOLBOX_WEBHOOK_USERNAME;
const PASS = process.env.KOBOTOOLBOX_WEBHOOK_PASSWORD;

function basic(user, pass, scheme = 'Basic') {
  return `${scheme} ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

const SUBMISSION = {
  _id: 1234,
  _uuid: '1f4f1a52-3c1e-4d0b-9a55-0c1f0e2a7a11',
  _submission_time: '2026-10-22T09:30:00',
  _xform_id_string: 'aXyZ123',
  name: 'Amina',
  age: '34',
};

const XML = '<aXyZ123 id="aXyZ123"><name>Amina</name><age>34</age></aXyZ123>';

function post(body = JSON.stringify(SUBMISSION), contentType = 'application/json') {
  return request(app).post('/webhooks/kobotoolbox').set('Content-Type', contentType).send(body);
}

describe('KoboToolbox REST Service endpoint', () => {
  describe('Basic auth verification', () => {
    it('accepts the correct credentials', async () => {
      const res = await post().set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('accepts the scheme case-insensitively', async () => {
      const res = await post().set('Authorization', basic(USER, PASS, 'basic'));
      expect(res.status).toBe(200);
    });

    it('splits on the first colon only (password may contain colons)', () => {
      const creds = parseBasicAuth(basic('u', 'a:b:c'));
      expect(creds.username.toString()).toBe('u');
      expect(creds.password.toString()).toBe('a:b:c');
    });

    it('rejects a wrong password', async () => {
      const res = await post().set('Authorization', basic(USER, 'wrong'));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong username', async () => {
      const res = await post().set('Authorization', basic('someone', PASS));
      expect(res.status).toBe(401);
    });

    it('rejects when both are wrong', async () => {
      const res = await post().set('Authorization', basic('x', 'y'));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects a non-Basic scheme', async () => {
      const res = await post().set('Authorization', `Bearer ${PASS}`);
      expect(res.status).toBe(401);
    });

    it('rejects malformed base64 and a missing colon', async () => {
      expect((await post().set('Authorization', 'Basic !!!notbase64')).status).toBe(401);
      const noColon = `Basic ${Buffer.from('nocolonhere').toString('base64')}`;
      expect((await post().set('Authorization', noColon)).status).toBe(401);
    });

    it('rejects everything when credentials are unconfigured', () => {
      const headers = { authorization: basic(USER, PASS) };
      expect(verifyKoboRequest(headers, '', '')).toBe(false);
      expect(verifyKoboRequest(headers, USER, '')).toBe(false);
      expect(verifyKoboRequest(headers, USER, PASS)).toBe(true);
    });

    it('handles non-ASCII credentials', () => {
      const headers = { authorization: basic('üser', 'pässwörd') };
      expect(verifyKoboRequest(headers, 'üser', 'pässwörd')).toBe(true);
      expect(verifyKoboRequest(headers, 'user', 'pässwörd')).toBe(false);
    });
  });

  describe('Body handling', () => {
    it('accepts a JSON submission', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post().set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(200);
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('New submission 1234'));
      spy.mockRestore();
    });

    it('accepts an XML submission', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(XML, 'application/xml').set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(200);
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('xml/text'));
      spy.mockRestore();
    });

    it('accepts JSON sent with any content type', async () => {
      const res = await post(JSON.stringify(SUBMISSION), 'text/plain').set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(200);
    });

    it('accepts a custom JSON wrapper', async () => {
      const res = await post(JSON.stringify({ source: 'kobo', data: SUBMISSION }))
        .set('Authorization', basic(USER, PASS));
      expect(res.status).toBe(200);
    });

    it('returns 401 (not 200) for an XML body without credentials', async () => {
      const res = await post(XML, 'application/xml');
      expect(res.status).toBe(401);
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
