const request = require('supertest');

// Set test environment variables before importing the app
process.env.TABBY_WEBHOOK_HEADER = 'X-Auth-Key';
process.env.TABBY_WEBHOOK_SECRET = 'Bearer test_tabby_secret_0123456789';

const app = require('../src/index');
const { verifyTabbyRequest } = require('../src/index');

const NAME = process.env.TABBY_WEBHOOK_HEADER;
const SECRET = process.env.TABBY_WEBHOOK_SECRET;

function payment(status = 'authorized', extra = {}) {
  return {
    id: 'pay_123', created_at: '2021-09-14T13:08:54Z', status, is_test: false,
    amount: '100', currency: 'SAR', order: { reference_id: 'order-1' },
    captures: [], refunds: [], ...extra,
  };
}

function dispute(status = 'pending') {
  return {
    status, dispute_id: 'dsp_1', payment_id: 'pay_123', currency: 'SAR',
    created_at: '2026-06-15T13:08:54Z',
  };
}

function post(body = JSON.stringify(payment()), contentType = 'application/json') {
  return request(app).post('/webhooks/tabby').set('Content-Type', contentType).send(body);
}

function logged(spy) {
  return spy.mock.calls.map(([m]) => String(m));
}

describe('Tabby webhook endpoint', () => {
  describe('header verification', () => {
    it('accepts the correct header and returns exactly 200', async () => {
      const res = await post().set(NAME, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('x-auth-key', SECRET);
      expect(res.status).toBe(200);
    });

    it('compares the whole value, including the Bearer prefix', async () => {
      const res = await post().set(NAME, SECRET.replace('Bearer ', ''));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await post().set(NAME, 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await post().set(NAME, 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects the secret sent under a different header name', async () => {
      const res = await post().set('X-Other', SECRET);
      expect(res.status).toBe(401);
    });

    it('supports a custom header name from TABBY_WEBHOOK_HEADER', () => {
      expect(verifyTabbyRequest({ 'x-tabby-key': 'abc' }, 'X-Tabby-Key', 'abc')).toBe(true);
      expect(verifyTabbyRequest({ 'x-tabby-key': 'abd' }, 'X-Tabby-Key', 'abc')).toBe(false);
    });

    it('rejects everything when TABBY_WEBHOOK_SECRET is unset', () => {
      expect(verifyTabbyRequest({ 'x-auth-key': SECRET }, 'X-Auth-Key', '')).toBe(false);
      delete process.env.TABBY_WEBHOOK_SECRET;
      expect(verifyTabbyRequest({ 'x-auth-key': SECRET })).toBe(false);
      process.env.TABBY_WEBHOOK_SECRET = SECRET;
    });
  });

  describe('body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(payment()), 'text/plain').set(NAME, SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set(NAME, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await post('[1,2]').set(NAME, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('payment dispatch (no event field)', () => {
    const cases = [
      ['authorized, no captures', payment('authorized'), 'Payment authorized'],
      ['authorized with a capture', payment('authorized', { captures: [{ id: 'c1' }] }), 'Payment captured'],
      ['closed', payment('closed'), 'Payment closed:'],
      ['closed with a refund', payment('closed', { refunds: [{ id: 'r1' }] }), 'Payment closed with refunds'],
      ['rejected', payment('rejected'), 'Payment rejected'],
      ['expired', payment('expired'), 'Payment expired'],
    ];

    it.each(cases)('handles %s', async (_name, body, expected) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(body)).set(NAME, SECRET);
      expect(res.status).toBe(200);
      expect(logged(spy).some((m) => m.startsWith(expected))).toBe(true);
      spy.mockRestore();
    });

    it('acknowledges unknown statuses', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(payment('something_new'))).set(NAME, SECRET);
      expect(res.status).toBe(200);
      expect(logged(spy).some((m) => m.startsWith('Unhandled payment status'))).toBe(true);
      spy.mockRestore();
    });
  });

  describe('dispute dispatch', () => {
    const cases = [
      ['pending', 'Dispute opened'],
      ['arbitration', 'Dispute in arbitration'],
      ['evidence_merchant', 'Dispute evidence requested'],
      ['approved', 'Dispute approved'],
      ['declined', 'Dispute declined'],
      ['cancelled', 'Dispute cancelled'],
    ];

    it.each(cases)('handles %s', async (status, expected) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(dispute(status))).set(NAME, SECRET);
      expect(res.status).toBe(200);
      expect(logged(spy).some((m) => m.startsWith(expected))).toBe(true);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
