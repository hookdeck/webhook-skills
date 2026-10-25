const request = require('supertest');

// Set test environment variables before importing the app
process.env.AUVIK_WEBHOOK_HEADER = 'X-Auvik-Key';
process.env.AUVIK_WEBHOOK_SECRET = 'Bearer test_auvik_secret_0123456789';

const app = require('../src/index');
const { verifyAuvikRequest } = require('../src/index');

const HEADER = process.env.AUVIK_WEBHOOK_HEADER;
const SECRET = process.env.AUVIK_WEBHOOK_SECRET;

function samplePayload(statusString = 'Triggered') {
  return {
    alertId: '1234',
    alertName: 'Device offline',
    alertStatus: statusString === 'Triggered' ? 0 : 1,
    alertStatusString: statusString,
    alertDescription: 'Switch is unreachable',
    entityName: 'core-switch-01',
    companyName: 'Acme MSP',
    date: '2026-10-25T10:00:00.000Z',
    link: 'https://example.auvik.com/alert/1234'
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app).post('/webhooks/auvik').set('Content-Type', contentType).send(body);
}

describe('Auvik webhook endpoint', () => {
  describe('header authentication', () => {
    it('accepts the exact header value', async () => {
      const res = await post().set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set(HEADER.toLowerCase(), SECRET);
      expect(res.status).toBe(200);
    });

    it('compares the whole value: a stripped Bearer prefix is rejected', async () => {
      const res = await post().set(HEADER, SECRET.replace('Bearer ', ''));
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

    it('rejects the secret sent under a different header', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(401);
    });

    it('authenticates before parsing: bad credential with bad JSON is 401', async () => {
      const res = await post('not json').set(HEADER, 'nope');
      expect(res.status).toBe(401);
    });
  });

  describe('body handling', () => {
    it.each(['Triggered', 'Cleared'])('handles %s alerts', async (status) => {
      const res = await post(JSON.stringify(samplePayload(status))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts an unknown status without failing', async () => {
      const res = await post(JSON.stringify(samplePayload('Other'))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('accepts JSON sent with any content type', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await post('not json').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object body', async () => {
      const res = await post('[1,2]').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for an empty body', async () => {
      const res = await request(app).post('/webhooks/auvik').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });
  });

  describe('verifyAuvikRequest', () => {
    it('defaults the header name to Authorization', () => {
      const old = process.env.AUVIK_WEBHOOK_HEADER;
      delete process.env.AUVIK_WEBHOOK_HEADER;
      expect(verifyAuvikRequest({ authorization: SECRET })).toBe(true);
      process.env.AUVIK_WEBHOOK_HEADER = old;
    });

    it('fails closed when no secret is configured', () => {
      expect(verifyAuvikRequest({ 'x-auvik-key': '' }, 'X-Auvik-Key', '')).toBe(false);
      expect(verifyAuvikRequest({ 'x-auvik-key': 'a' }, 'X-Auvik-Key', undefined)).toBe(false);
    });
  });
});
