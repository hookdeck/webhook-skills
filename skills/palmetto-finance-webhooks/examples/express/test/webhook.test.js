const request = require('supertest');

// Set test environment variables before importing the app
process.env.PALMETTO_FINANCE_WEBHOOK_HEADER = 'apiKey';
process.env.PALMETTO_FINANCE_WEBHOOK_SECRET = 'test_palmetto_server_api_key_0123456789';

const app = require('../src/index');
const { verifyPalmettoFinanceRequest } = require('../src/index');

const SECRET = process.env.PALMETTO_FINANCE_WEBHOOK_SECRET;

const EVENTS = [
  'accountCreated', 'accountUpdated', 'sendInvite', 'applicationStatus', 'contractApproved',
  'contractSending', 'contractSent', 'contractSigned', 'contractVoided', 'contractReinstated',
  'documentStatus', 'documentUploaded', 'milestonePackage', 'milestoneAchieved',
  'milestoneStatusChanged', 'quoteCreated', 'quoteVoided', 'requirementStatusChanged',
  'requirementCompleted', 'termsAndConditionsAccepted', 'allConsumerTaskEvents',
];

function samplePayload(event = 'accountCreated') {
  return {
    event,
    accountId: 'palmetto-finance-account-id',
    accountReference: 'account-external-reference',
    organizationId: 'my-lightreach-alias',
    programType: 'solar',
  };
}

function send(method = 'post', body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  const req = request(app)[method]('/webhooks/palmetto-finance');
  return body === undefined ? req : req.set('Content-Type', contentType).send(body);
}

describe('Palmetto Finance webhook endpoint', () => {
  describe('API key header verification', () => {
    it('accepts the correct key', async () => {
      const res = await send().set('apiKey', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await send().set('APIKEY', SECRET);
      expect(res.status).toBe(200);
    });

    it('rejects a wrong key of the same length', async () => {
      const res = await send().set('apiKey', 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a key of a different length without throwing', async () => {
      const res = await send().set('apiKey', 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing key', async () => {
      const res = await send();
      expect(res.status).toBe(401);
    });

    it('rejects the key sent in a different header', async () => {
      const res = await send().set('api_key', SECRET);
      expect(res.status).toBe(401);
    });

    it('compares the whole value and does not strip a Bearer prefix', async () => {
      const res = await send().set('apiKey', `Bearer ${SECRET}`);
      expect(res.status).toBe(401);
    });

    it('uses the whole value when the secret itself includes a Bearer prefix', () => {
      const secret = 'Bearer abc123';
      expect(verifyPalmettoFinanceRequest({ apikey: 'Bearer abc123' }, secret, 'apiKey')).toBe(true);
      expect(verifyPalmettoFinanceRequest({ apikey: 'abc123' }, secret, 'apiKey')).toBe(false);
    });

    it('supports a custom header name such as api_key', async () => {
      expect(verifyPalmettoFinanceRequest({ api_key: SECRET }, SECRET, 'api_key')).toBe(true);
      expect(verifyPalmettoFinanceRequest({ apikey: SECRET }, SECRET, 'api_key')).toBe(false);
    });

    it('rejects everything when the secret is unset', () => {
      expect(verifyPalmettoFinanceRequest({ apikey: SECRET }, '')).toBe(false);
      delete process.env.PALMETTO_FINANCE_WEBHOOK_SECRET;
      expect(verifyPalmettoFinanceRequest({ apikey: SECRET })).toBe(false);
      process.env.PALMETTO_FINANCE_WEBHOOK_SECRET = SECRET;
    });
  });

  describe('HTTP methods', () => {
    it.each(['post', 'put', 'patch', 'delete', 'get'])('accepts %s with the key', async (method) => {
      const res = await send(method).set('apiKey', SECRET);
      expect(res.status).toBe(200);
    });

    it.each(['post', 'put', 'patch', 'delete', 'get'])('rejects %s without the key', async (method) => {
      const res = await send(method);
      expect(res.status).toBe(401);
    });

    it('acknowledges an empty body', async () => {
      const get = await send('get', undefined).set('apiKey', SECRET);
      expect(get.status).toBe(200);
      const del = await send('delete', '').set('apiKey', SECRET);
      expect(del.status).toBe(200);
    });

    it('checks the credential before an empty body', async () => {
      const res = await send('get', undefined);
      expect(res.status).toBe(401);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await send('post', JSON.stringify(samplePayload()), 'text/plain').set('apiKey', SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await send('post', '{not json').set('apiKey', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await send('post', '[1,2]').set('apiKey', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without a key', async () => {
      const res = await send('post', '{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (event) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await send('post', JSON.stringify(samplePayload(event))).set('apiKey', SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await send('post', JSON.stringify(samplePayload('somethingNew'))).set('apiKey', SECRET);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
