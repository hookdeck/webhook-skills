const request = require('supertest');

// Set test environment variables before importing the app
process.env.INGENIOUS_BUILD_WEBHOOK_HEADER = 'Authorization';
process.env.INGENIOUS_BUILD_WEBHOOK_SECRET = 'Bearer test_ingenious_build_token_0123456789';

const app = require('../src/index');
const { verifyIngeniousBuildRequest } = require('../src/index');

const SECRET = process.env.INGENIOUS_BUILD_WEBHOOK_SECRET;

const EVENTS = {
  budget_exported_to_accounting: 'budget',
  budget_change_exported_to_accounting: 'budget_change',
  contract_exported_to_accounting: 'contract',
  contract_change_exported_to_accounting: 'contract_change',
  invoice_exported_to_accounting: 'invoice',
};

function samplePayload(name = 'invoice_exported_to_accounting') {
  return {
    name,
    subject: EVENTS[name] || 'other',
    data: { id: '507f1f77bcf86cd799439012', invoice_number: 'INV-123', gross_value: '1000.00', items: [] },
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/ingenious-build')
    .set('Content-Type', contentType)
    .send(body);
}

describe('INGENIOUS.BUILD webhook endpoint', () => {
  describe('auth header verification', () => {
    it('accepts the exact header value', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('compares the whole value: the bare token without "Bearer " is rejected', async () => {
      const res = await post().set('Authorization', SECRET.replace('Bearer ', ''));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await post().set('Authorization', 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await post().set('Authorization', 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('reads a custom header name from INGENIOUS_BUILD_WEBHOOK_HEADER', () => {
      expect(verifyIngeniousBuildRequest({ 'x-ib-token': 's3cret' }, 'X-IB-Token', 's3cret')).toBe(true);
      expect(verifyIngeniousBuildRequest({ authorization: 's3cret' }, 'X-IB-Token', 's3cret')).toBe(false);
    });

    it('rejects everything when the secret is unset', () => {
      expect(verifyIngeniousBuildRequest({ authorization: SECRET }, 'Authorization', '')).toBe(false);
      const saved = process.env.INGENIOUS_BUILD_WEBHOOK_SECRET;
      delete process.env.INGENIOUS_BUILD_WEBHOOK_SECRET;
      expect(verifyIngeniousBuildRequest({ authorization: SECRET })).toBe(false);
      process.env.INGENIOUS_BUILD_WEBHOOK_SECRET = saved;
    });
  });

  describe('body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await post('[1,2]').set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('event handling', () => {
    it.each(Object.keys(EVENTS))('handles %s', async (name) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload(name))).set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload('something_new'))).set('Authorization', SECRET);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
