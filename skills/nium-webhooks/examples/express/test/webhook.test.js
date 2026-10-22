const request = require('supertest');

// Set test environment variables before importing the app
process.env.NIUM_WEBHOOK_HEADER = 'x-partner-key';
process.env.NIUM_WEBHOOK_SECRET = 'Bearer test_nium_secret_0123456789';

const app = require('../src/index');
const { verifyNiumRequest } = require('../src/index');

const HEADER = process.env.NIUM_WEBHOOK_HEADER;
// The configured value includes a 'Bearer ' prefix: it is compared whole, never parsed.
const SECRET = process.env.NIUM_WEBHOOK_SECRET;

const TEMPLATES = [
  'CUSTOMER_STATUS_WEBHOOK', 'CUSTOMER_ODD_STATUS_WEBHOOK', 'CARD_CLIENT_KYB_STATUS_WEBHOOK',
  'REMIT_TRANSACTION_INITIATED_WEBHOOK', 'REMIT_TRANSACTION_PAID_WEBHOOK',
  'REMIT_TRANSACTION_REJECTED_WEBHOOK', 'REMIT_TRANSACTION_RETURNED_WEBHOOK',
  'FX_CONVERSION_COMPLETED_WEBHOOK', 'FX_CONVERSION_FAILED_WEBHOOK', 'FX_CONVERSION_CANCELLED_WEBHOOK',
  'CARD_POS_APPROVED_WEBHOOK', 'CARD_ATM_APPROVED_WEBHOOK', 'CARD_WALLET_FUNDING_WEBHOOK',
  'VIRTUAL_ACCOUNT_ASSIGNED_WEBHOOK', 'INCOMING_FUNDS_WEBHOOK'
];
const RFI_STATUSES = ['RFI_REQUESTED', 'RFI_RESPONDED', 'RFI_CLOSED'];

function samplePayload(template = 'REMIT_TRANSACTION_PAID_WEBHOOK') {
  return {
    clientHashId: '0498f10f-1968-494f-9f7a-454ed23942a0',
    customerHashId: '0de1e512-e0d7-4eca-ad41-dd39325facc2',
    walletHashId: 'e83cca77-8b63-4a25-b580-1d872380ef29',
    systemReferenceNumber: 'RT1343085439',
    template
  };
}

function rfiPayload(status) {
  return {
    clientHashId: 'b1cb53e3-6a1b-4b58-a10d-5a79c5967cef',
    customerHashId: '85c21489-94aa-4e65-ab7e-1c6bcea84e27',
    rfiDetails: { rfiId: 'rfi_7f3a9c12', status, query: 'Please provide the source of funds.' }
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/nium')
    .set('Content-Type', contentType)
    .send(body);
}

function logged(spy) {
  return spy.mock.calls.map(([m]) => String(m));
}

describe('Nium webhook endpoint', () => {
  describe('static header authentication', () => {
    it('accepts the correct value', async () => {
      const res = await post().set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('X-Partner-Key', SECRET);
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

    it('does not accept the secret under a different header', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(401);
    });

    it('rejects everything when NIUM_WEBHOOK_SECRET is unset', () => {
      expect(verifyNiumRequest({ 'x-partner-key': SECRET }, '')).toBe(false);
      delete process.env.NIUM_WEBHOOK_SECRET;
      expect(verifyNiumRequest({ 'x-partner-key': SECRET })).toBe(false);
      process.env.NIUM_WEBHOOK_SECRET = SECRET;
    });

    it('honours a user-chosen header name', () => {
      expect(verifyNiumRequest({ 'x-acme-token': SECRET }, SECRET, 'X-Acme-Token')).toBe(true);
      expect(verifyNiumRequest({ 'x-partner-key': SECRET }, SECRET, 'X-Acme-Token')).toBe(false);
    });

    it('defaults the header name to x-partner-key', () => {
      const saved = process.env.NIUM_WEBHOOK_HEADER;
      delete process.env.NIUM_WEBHOOK_HEADER;
      expect(verifyNiumRequest({ 'x-partner-key': SECRET })).toBe(true);
      process.env.NIUM_WEBHOOK_HEADER = saved;
    });
  });

  describe('body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set(HEADER, SECRET);
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

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('event handling', () => {
    it.each(TEMPLATES)('handles %s', async (template) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload(template))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(logged(spy).some((m) => m.startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it.each(RFI_STATUSES)('handles RFI event %s (rfiDetails.status)', async (status) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(rfiPayload(status))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(logged(spy).some((m) => m.startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown templates', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload('SOMETHING_NEW_WEBHOOK'))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(logged(spy)).toContain('Unhandled event: SOMETHING_NEW_WEBHOOK');
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
