const request = require('supertest');

// Set test environment variables before importing the app
process.env.PAXOS_WEBHOOK_HEADER = 'X-Paxos-Webhook-Secret';
process.env.PAXOS_WEBHOOK_SECRET = 'Bearer test_paxos_secret_0123456789';

const app = require('../src/index');
const { verifyPaxosRequest } = require('../src/index');

const HEADER = process.env.PAXOS_WEBHOOK_HEADER;
const SECRET = process.env.PAXOS_WEBHOOK_SECRET;

const EVENTS = [
  'identity.approved', 'identity.denied', 'identity.documents_required',
  'identity.documents_accepted', 'identity.documents_denied',
  'transfer.crypto_deposit.pending', 'transfer.crypto_deposit.completed',
  'transfer.wire_withdrawal.failed', 'orchestration.processing', 'orchestration.completed',
  'orchestration.failed'
];

function sampleEvent(type = 'identity.approved', extra = {}) {
  return {
    id: 'bd019f1c-89a7-4372-9d21-eaad9280dc41',
    type,
    source: 'com.paxos',
    time: '2025-01-01T14:30:02Z',
    object: 'event',
    is_test: false,
    ...extra
  };
}

function post(body = JSON.stringify(sampleEvent()), contentType = 'application/json') {
  return request(app).post('/webhooks/paxos').set('Content-Type', contentType).send(body);
}

describe('Paxos webhook endpoint', () => {
  describe('API key header verification', () => {
    it('accepts the correct header value', async () => {
      const res = await post().set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set(HEADER.toUpperCase(), SECRET);
      expect(res.status).toBe(200);
    });

    it('compares the whole value, including the Bearer prefix', async () => {
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

    it('does not read the secret from a different header', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(401);
    });

    it('rejects non-ASCII values without throwing', async () => {
      expect(verifyPaxosRequest({ [HEADER.toLowerCase()]: 'sécret-ключ' })).toBe(false);
    });

    it('rejects everything when PAXOS_WEBHOOK_SECRET is unset', () => {
      const headers = { [HEADER.toLowerCase()]: SECRET };
      expect(verifyPaxosRequest(headers, '')).toBe(false);
      delete process.env.PAXOS_WEBHOOK_SECRET;
      expect(verifyPaxosRequest(headers)).toBe(false);
      process.env.PAXOS_WEBHOOK_SECRET = SECRET;
    });

    it('defaults the header name to Authorization', () => {
      expect(verifyPaxosRequest({ authorization: 'abc' }, 'abc', undefined)).toBe(false); // env header set
      delete process.env.PAXOS_WEBHOOK_HEADER;
      expect(verifyPaxosRequest({ authorization: 'abc' }, 'abc')).toBe(true);
      process.env.PAXOS_WEBHOOK_HEADER = HEADER;
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(sampleEvent()), 'text/plain').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a body without a type', async () => {
      const res = await post('{"id":"1"}').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (type) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(sampleEvent(type))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('ignores test events', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(sampleEvent('identity.approved', { is_test: true })))
        .set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body.test).toBe(true);
      expect(spy.mock.calls.some(([m]) => String(m).includes('Identity approved'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(sampleEvent('something.new'))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
