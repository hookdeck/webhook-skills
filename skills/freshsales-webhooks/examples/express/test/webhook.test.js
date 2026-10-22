const request = require('supertest');

// Set test environment variables before importing the app
process.env.FRESHSALES_WEBHOOK_SECRET = 'a3f9c0e17b2d4c58b6e1f0a9d8c7b6a5';
delete process.env.FRESHSALES_WEBHOOK_HEADER; // exercise the X-Webhook-Secret default

const app = require('../src/index');
const { verifyFreshsalesRequest } = require('../src/index');

const SECRET = process.env.FRESHSALES_WEBHOOK_SECRET;
const HEADER = 'X-Webhook-Secret';

// Illustrative Advanced content: Freshsales sends whatever the workflow author writes.
const DEAL = { deal: { id: '12345', name: 'Acme renewal', amount: '5000', stage: 'Won' } };
const CONTACT = { contact: { id: '678', first_name: 'Ada', email: 'ada@example.com' } };

function send(method, body, contentType = 'application/json') {
  const req = request(app)[method.toLowerCase()]('/webhooks/freshsales');
  if (body !== undefined) req.set('Content-Type', contentType).send(body);
  return req;
}

describe('Freshsales webhook endpoint', () => {
  describe('Secret header verification', () => {
    it('accepts the correct secret', async () => {
      const res = await send('POST', JSON.stringify(DEAL)).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await send('POST', JSON.stringify(DEAL)).set('x-WEBHOOK-secret', SECRET);
      expect(res.status).toBe(200);
    });

    it('compares the whole value, including a Bearer prefix', async () => {
      const prev = process.env.FRESHSALES_WEBHOOK_SECRET;
      const headers = { 'x-webhook-secret': `Bearer ${SECRET}` };
      expect(verifyFreshsalesRequest(headers, `Bearer ${SECRET}`)).toBe(true);
      expect(verifyFreshsalesRequest(headers, SECRET)).toBe(false);
      expect(verifyFreshsalesRequest({ 'x-webhook-secret': SECRET }, `Bearer ${SECRET}`)).toBe(false);
      process.env.FRESHSALES_WEBHOOK_SECRET = prev;
    });

    it('rejects a wrong secret of the same length', async () => {
      const res = await send('POST', JSON.stringify(DEAL)).set(HEADER, 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a secret of a different length without throwing', async () => {
      const res = await send('POST', JSON.stringify(DEAL)).set(HEADER, 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a non-ASCII secret without throwing', async () => {
      expect(verifyFreshsalesRequest({ 'x-webhook-secret': 'sécrét-☃' })).toBe(false);
    });

    it('rejects a missing header', async () => {
      const res = await send('POST', JSON.stringify(DEAL));
      expect(res.status).toBe(401);
    });

    it('rejects a secret sent in a different header', async () => {
      const res = await send('POST', JSON.stringify(DEAL)).set('Authorization', SECRET);
      expect(res.status).toBe(401);
    });

    it('rejects everything when FRESHSALES_WEBHOOK_SECRET is unset', () => {
      expect(verifyFreshsalesRequest({ 'x-webhook-secret': SECRET }, '')).toBe(false);
      delete process.env.FRESHSALES_WEBHOOK_SECRET;
      expect(verifyFreshsalesRequest({ 'x-webhook-secret': SECRET })).toBe(false);
      process.env.FRESHSALES_WEBHOOK_SECRET = SECRET;
    });

    it('honours a custom header name', () => {
      expect(verifyFreshsalesRequest({ 'x-fs-key': SECRET }, SECRET, 'X-FS-Key')).toBe(true);
      expect(verifyFreshsalesRequest({ 'x-webhook-secret': SECRET }, SECRET, 'X-FS-Key')).toBe(false);
    });
  });

  describe('Request methods', () => {
    it.each(['POST', 'PUT', 'PATCH'])('accepts %s with a body', async (method) => {
      const res = await send(method, JSON.stringify(DEAL)).set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it.each(['GET', 'DELETE'])('accepts %s with no body', async (method) => {
      const res = await send(method).set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it.each(['GET', 'DELETE'])('rejects %s without the secret', async (method) => {
      const res = await send(method);
      expect(res.status).toBe(401);
    });

    it('rejects methods Freshsales cannot send', async () => {
      const res = await request(app).options('/webhooks/freshsales').set(HEADER, SECRET);
      expect(res.status).toBe(405);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await send('POST', JSON.stringify(DEAL), 'text/plain').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts an empty POST body', async () => {
      const res = await send('POST', '').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await send('POST', '{not json').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the secret', async () => {
      const res = await send('POST', '{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('Payload handling', () => {
    let spy;
    beforeEach(() => { spy = jest.spyOn(console, 'log').mockImplementation(() => {}); });
    afterEach(() => spy.mockRestore());

    it('handles an illustrative deal body', async () => {
      await send('POST', JSON.stringify(DEAL)).set(HEADER, SECRET);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Deal webhook'))).toBe(true);
    });

    it('handles an illustrative contact body', async () => {
      await send('POST', JSON.stringify(CONTACT)).set(HEADER, SECRET);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Contact webhook'))).toBe(true);
    });

    it('acknowledges bodies of any other shape', async () => {
      const res = await send('POST', JSON.stringify({ anything: 'else' })).set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
