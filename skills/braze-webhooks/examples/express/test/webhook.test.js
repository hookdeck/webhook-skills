const request = require('supertest');

// Set test environment variables before importing the app
process.env.BRAZE_WEBHOOK_USERNAME = 'braze-user';
process.env.BRAZE_WEBHOOK_PASSWORD = 'p@ss:word-with-colon-0123456789';

const app = require('../src/index');
const { verifyBrazeRequest, parseBasicAuth } = require('../src/index');

const USER = process.env.BRAZE_WEBHOOK_USERNAME;
const PASS = process.env.BRAZE_WEBHOOK_PASSWORD;

const basic = (u, p) => `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}`;
const GOOD = basic(USER, PASS);

// Illustrative body: Braze adds no event field, the marketer composes it.
const BODY = JSON.stringify({ message_body: 'Your order just arrived!', user_id: 'u_123' });

function send(method, { auth, body, contentType = 'application/json' } = {}) {
  let req = request(app)[method.toLowerCase()]('/webhooks/braze');
  if (auth !== undefined) req = req.set('Authorization', auth);
  if (body !== undefined) req = req.set('Content-Type', contentType).send(body);
  return req;
}

describe('Braze webhook endpoint', () => {
  describe('Basic auth verification', () => {
    it('accepts the correct credential', async () => {
      const res = await send('POST', { auth: GOOD, body: BODY });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('accepts the scheme case-insensitively', async () => {
      const res = await send('POST', { auth: GOOD.replace('Basic', 'basic'), body: BODY });
      expect(res.status).toBe(200);
    });

    it('splits on the first colon (password may contain colons)', () => {
      expect(parseBasicAuth(basic('a', 'b:c:d'))).toEqual({ username: 'a', password: 'b:c:d' });
    });

    it('rejects a wrong password of the same length', async () => {
      const res = await send('POST', { auth: basic(USER, 'x'.repeat(PASS.length)), body: BODY });
      expect(res.status).toBe(401);
    });

    it('rejects a wrong username with the right password', async () => {
      const res = await send('POST', { auth: basic('other-user', PASS), body: BODY });
      expect(res.status).toBe(401);
    });

    it('rejects a right username with a different-length password without throwing', async () => {
      const res = await send('POST', { auth: basic(USER, 'short'), body: BODY });
      expect(res.status).toBe(401);
    });

    it('rejects a missing Authorization header', async () => {
      const res = await send('POST', { body: BODY });
      expect(res.status).toBe(401);
      expect(res.headers['www-authenticate']).toMatch(/^Basic/);
    });

    it('rejects a non-Basic scheme', async () => {
      const res = await send('POST', { auth: `Bearer ${PASS}`, body: BODY });
      expect(res.status).toBe(401);
    });

    it('rejects Basic credentials without a colon', async () => {
      const res = await send('POST', {
        auth: `Basic ${Buffer.from('nocolon').toString('base64')}`,
        body: BODY,
      });
      expect(res.status).toBe(401);
    });

    it('rejects a malformed Authorization header', async () => {
      expect((await send('POST', { auth: 'Basic', body: BODY })).status).toBe(401);
      expect((await send('POST', { auth: 'Basic !!!not-base64!!!', body: BODY })).status).toBe(401);
    });

    it('handles non-ASCII credentials', () => {
      const headers = { authorization: basic('usér', 'pässwörd') };
      expect(verifyBrazeRequest(headers, 'usér', 'pässwörd')).toBe(true);
      expect(verifyBrazeRequest(headers, 'usér', 'password')).toBe(false);
    });

    it('rejects everything when credentials are not configured', () => {
      const headers = { authorization: GOOD };
      expect(verifyBrazeRequest(headers, '', '')).toBe(false);
      expect(verifyBrazeRequest(headers, USER, '')).toBe(false);
      delete process.env.BRAZE_WEBHOOK_USERNAME;
      delete process.env.BRAZE_WEBHOOK_PASSWORD;
      expect(verifyBrazeRequest(headers)).toBe(false);
      process.env.BRAZE_WEBHOOK_USERNAME = USER;
      process.env.BRAZE_WEBHOOK_PASSWORD = PASS;
    });
  });

  describe('HTTP methods', () => {
    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('accepts %s with a JSON body', async (method) => {
      const res = await send(method, { auth: GOOD, body: BODY });
      expect(res.status).toBe(200);
    });

    it('accepts GET with no body', async () => {
      const res = await send('GET', { auth: GOOD });
      expect(res.status).toBe(200);
    });

    it.each(['POST', 'PUT', 'PATCH', 'GET', 'DELETE'])('requires auth on %s', async (method) => {
      const res = await send(method, { body: method === 'GET' ? undefined : BODY });
      expect(res.status).toBe(401);
    });

    it('rejects other methods with 405', async () => {
      const res = await request(app).options('/webhooks/braze').set('Authorization', GOOD);
      expect(res.status).toBe(405);
      expect(res.headers.allow).toContain('POST');
    });
  });

  describe('Body handling', () => {
    it('accepts an empty POST body', async () => {
      const res = await send('POST', { auth: GOOD });
      expect(res.status).toBe(200);
    });

    it('accepts raw text bodies of any content type', async () => {
      for (const [body, contentType] of [
        ['<order><status>arrived</status></order>', 'application/xml'],
        ['to=%2B15551234567&text=Your+order+just+arrived', 'application/x-www-form-urlencoded'],
        ['Hello {{first_name}}', 'text/plain'],
        ['{not json', 'application/json'],
      ]) {
        const res = await send('POST', { auth: GOOD, body, contentType });
        expect(res.status).toBe(200);
      }
    });

    it('accepts a JSON array body', async () => {
      const res = await send('POST', { auth: GOOD, body: '[1,2]' });
      expect(res.status).toBe(200);
    });

    it('returns 401, not a parse error, for garbage without credentials', async () => {
      const res = await send('POST', { body: '{not json' });
      expect(res.status).toBe(401);
    });

    it('logs JSON, text and empty bodies differently', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await send('POST', { auth: GOOD, body: BODY });
      await send('POST', { auth: GOOD, body: 'plain text', contentType: 'text/plain' });
      await send('GET', { auth: GOOD });
      const lines = spy.mock.calls.map(([m]) => String(m));
      spy.mockRestore();
      expect(lines.some((l) => l.includes('JSON body'))).toBe(true);
      expect(lines.some((l) => l.includes('text body'))).toBe(true);
      expect(lines.some((l) => l.includes('no body'))).toBe(true);
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
