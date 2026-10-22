const request = require('supertest');

// Set test environment variables before importing the app
process.env.TRAY_IO_WEBHOOK_HEADER = 'X-Tray-Secret';
process.env.TRAY_IO_WEBHOOK_SECRET = 'Bearer test_tray_secret_0123456789';

const app = require('../src/index');
const { verifyTrayRequest } = require('../src/index');

const HEADER = process.env.TRAY_IO_WEBHOOK_HEADER;
const SECRET = process.env.TRAY_IO_WEBHOOK_SECRET;

const EVENTS = ['record.created', 'record.updated', 'record.deleted'];

function samplePayload(event = 'record.created') {
  return { event, data: { id: 'rec_123', name: 'Acme' } };
}

function send(method, body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  const req = request(app)[method]('/webhooks/tray-io');
  if (body === null) return req;
  return req.set('Content-Type', contentType).send(body);
}

describe('Tray.io webhook endpoint', () => {
  describe('credential header verification', () => {
    it('accepts the correct whole value', async () => {
      const res = await send('post').set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await send('post').set(HEADER.toLowerCase(), SECRET);
      expect(res.status).toBe(200);
    });

    it('does not strip a Bearer prefix', async () => {
      const res = await send('post').set(HEADER, SECRET.replace('Bearer ', ''));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await send('post').set(HEADER, 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await send('post').set(HEADER, 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await send('post');
      expect(res.status).toBe(401);
    });

    it('does not look in a different header', async () => {
      const res = await send('post').set('Authorization', SECRET);
      expect(res.status).toBe(401);
    });

    it('rejects when no secret is configured', () => {
      expect(verifyTrayRequest({ [HEADER.toLowerCase()]: SECRET }, { secret: '' })).toBe(false);
    });

    it('defaults to the Authorization header', () => {
      expect(verifyTrayRequest({ authorization: 'abc' }, { headerName: 'Authorization', secret: 'abc' })).toBe(true);
      expect(verifyTrayRequest({ authorization: 'abd' }, { headerName: 'Authorization', secret: 'abc' })).toBe(false);
    });

    it('handles non-ASCII secrets', () => {
      const secret = 'sécret-ünïcode';
      const sent = Buffer.from(secret, 'utf8').toString('latin1'); // how Node exposes header bytes
      expect(verifyTrayRequest({ authorization: sent }, { headerName: 'Authorization', secret })).toBe(true);
    });
  });

  describe('methods', () => {
    it.each(['post', 'put', 'patch', 'delete'])('accepts %s with a body', async (method) => {
      const res = await send(method).set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts GET with an empty body', async () => {
      const res = await send('get', null).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('rejects an unauthenticated GET', async () => {
      const res = await send('get', null);
      expect(res.status).toBe(401);
    });

    it('accepts a POST with an empty body', async () => {
      const res = await send('post', '').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });
  });

  describe('events', () => {
    it.each(EVENTS)('handles %s', async (event) => {
      const res = await send('post', JSON.stringify(samplePayload(event))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts an unknown event', async () => {
      const res = await send('post', JSON.stringify({ event: 'custom.thing' })).set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts any content type when the body is JSON', async () => {
      const res = await send('post', JSON.stringify(samplePayload()), 'text/plain').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });
  });

  describe('body validation', () => {
    it('returns 400 for invalid JSON', async () => {
      const res = await send('post', 'not json').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a form-encoded body', async () => {
      const res = await send('post', 'a=1', 'application/x-www-form-urlencoded').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a JSON array', async () => {
      const res = await send('post', '[]').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('authenticates before parsing: bad credential with bad JSON is 401', async () => {
      const res = await send('post', 'not json').set(HEADER, 'wrong');
      expect(res.status).toBe(401);
    });
  });

  it('exposes a health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
