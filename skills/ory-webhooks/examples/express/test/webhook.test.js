const request = require('supertest');

// Set test environment variables before importing the app
process.env.ORY_WEBHOOK_HEADER = 'X-Ory-Webhook-Key';
process.env.ORY_WEBHOOK_SECRET = 'Bearer test_ory_secret_0123456789';

const app = require('../src/index');
const { verifyOryRequest } = require('../src/index');

const HEADER = process.env.ORY_WEBHOOK_HEADER;
const SECRET = process.env.ORY_WEBHOOK_SECRET;

const EVENTS = [
  'registration.after', 'login.after', 'settings.after', 'verification.after', 'recovery.after'
];

// Mirrors the illustrative Jsonnet template: function(ctx) { event: 'registration.after', identity: ctx.identity }
function samplePayload(event = 'registration.after') {
  return {
    event,
    identity: { id: '3a5293f1-f4d6-49f4-b34f-6da62c360604', traits: { email: 'user@example.com' } }
  };
}

function send(method, body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  const req = request(app)[method]('/webhooks/ory');
  return body === undefined ? req : req.set('Content-Type', contentType).send(body);
}

const post = (...args) => send('post', ...args);

describe('Ory webhook endpoint', () => {
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

    it('compares the whole value: "Bearer " is not stripped', async () => {
      const res = await post().set(HEADER, 'test_ory_secret_0123456789');
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

    it('ignores the secret in a different header', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(401);
    });

    it('rejects everything when ORY_WEBHOOK_SECRET is unset', () => {
      const headers = { 'x-ory-webhook-key': SECRET };
      expect(verifyOryRequest(headers, '', HEADER)).toBe(false);
      expect(verifyOryRequest(headers, SECRET, HEADER)).toBe(true);
    });

    it('defaults the header name to Authorization', () => {
      delete process.env.ORY_WEBHOOK_HEADER;
      expect(verifyOryRequest({ authorization: SECRET })).toBe(true);
      process.env.ORY_WEBHOOK_HEADER = HEADER;
    });

    it('handles non-ASCII credentials', async () => {
      const res = await post().set(HEADER, Buffer.from('séc€ret', 'utf8').toString('latin1'));
      expect(res.status).toBe(401);
    });
  });

  describe('methods', () => {
    it.each(['post', 'put', 'patch'])('accepts %s with a body', async (method) => {
      const res = await send(method).set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts GET with no body', async () => {
      const res = await send('get', undefined).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('requires the credential on GET too', async () => {
      const res = await send('get', undefined);
      expect(res.status).toBe(401);
    });

    it('rejects DELETE', async () => {
      const res = await send('delete', undefined).set(HEADER, SECRET);
      expect(res.status).toBe(405);
    });
  });

  describe('body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts an empty body', async () => {
      const res = await post('', 'application/json').set(HEADER, SECRET);
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

  describe('event handling', () => {
    it.each(EVENTS)('handles %s', async (event) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload(event))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload('something.new'))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
