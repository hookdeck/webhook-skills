const crypto = require('crypto');
const request = require('supertest');

// Set test environment variables before importing the app.
// The signing key is shown once in the Felloh dashboard; any string works, used as UTF-8 bytes.
process.env.FELLOH_WEBHOOK_SECRET = 'test_felloh_signing_key_0123456789';

const app = require('../src/index');
const { verifyFellohSignature, classify } = require('../src/index');

const SECRET = process.env.FELLOH_WEBHOOK_SECRET;

// Payloads follow the samples in Felloh's webhook docs.
const PAYLOADS = {
  'transaction-status': {
    amount: 10000,
    booking: { id: '3d38e53b-867a-43bd-ad5d-4af786dd1b33', booking_reference: 'test-123' },
    completed_at: '2021-11-03T11:04:27.000Z',
    currency: 'GBX',
    payment_link: { id: '2cc9b939-d2fa-41e5-abae-39c377236978' },
    ecommerce: { id: null },
    provider: { name: 'nuvei', reference: '93216A82FBDD1696203B7FC6099A9B66.prod02-vm-tx94' },
    status: 'COMPLETE',
    transaction: { id: '2cc9b939-d3fa-41e5-acae-39c377236978' },
    surcharge: { surcharge_applied: true, amount: 100, currency: 'GBX' },
  },
  'refund-status': {
    authorisation_code: '3d38e53b-867a-43bd-ad5d-4af786dd1b33',
    actioned_at: '2021-11-03T11:04:27.000Z',
    amount: 100,
    metadata: { internal_id: 'abc-1234' },
    status: { id: 'PENDING_AUTHORISATION' },
    transaction: {
      id: '2cc9b939-d3fa-41e5-acae-39c377236978',
      amount: 100,
      currency: 'GBX',
      booking: { booking_reference: 'FE123456', customer_name: 'Caroline Rennie' },
    },
  },
  booking: {
    booking: { id: '3d38e53b-867a-43bd-ad5d-4af786dd1b33', booking_reference: 'FE123456' },
    customer_name: 'Caroline Rennie',
    email: 'caroline@example.com',
    amount: 250000,
    currency: 'GBX',
    departure_date: '2027-05-01',
    return_date: '2027-05-14',
    customer: { id: '5c2d8e1f-4a6b-4c8d-9e0f-1a2b3c4d5e6f' },
    created_at: '2026-10-16T11:04:27.000Z',
    deleted_at: null,
  },
  'user-create': {
    user: { id: '4f2b8c91-6d3e-4a75-9b0c-1e2f3a4b5c6d' },
    email: 'caroline@example.com',
    first_name: 'Caroline',
    last_name: 'Rennie',
    status: 'ACTIVE',
    is_api_user: false,
    organisation: { id: 'X1234', name: 'Example Travel' },
    created_at: '2026-10-16T11:04:27.000Z',
  },
};

// Felloh: bare hex HMAC-SHA256 of the raw body, keyed with the signing key.
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function post(body, headers = {}) {
  return request(app)
    .post('/webhooks/felloh')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(body);
}

describe('Felloh webhook handler', () => {
  let logSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('valid signatures', () => {
    it.each(Object.keys(PAYLOADS))('accepts a %s delivery', async (name) => {
      const body = JSON.stringify(PAYLOADS[name]);
      const res = await post(body, { 'X-Signature': sign(body) });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
      expect(logSpy).not.toHaveBeenCalledWith('Unhandled Felloh delivery');
    });

    it('accepts an uppercase hex signature', async () => {
      const body = JSON.stringify(PAYLOADS.booking);
      const res = await post(body, { 'X-Signature': sign(body).toUpperCase() });
      expect(res.status).toBe(200);
    });

    it('verifies the exact bytes received (pretty-printed body)', async () => {
      const body = JSON.stringify(PAYLOADS['transaction-status'], null, 2);
      const res = await post(body, { 'X-Signature': sign(body) });
      expect(res.status).toBe(200);
    });

    it('accepts any content type', async () => {
      const body = JSON.stringify(PAYLOADS.booking);
      const res = await request(app)
        .post('/webhooks/felloh')
        .set('Content-Type', 'text/plain')
        .set('X-Signature', sign(body))
        .send(body);
      expect(res.status).toBe(200);
    });

    it('accepts a dashboard test delivery signed with the real key', async () => {
      const body = JSON.stringify(PAYLOADS['transaction-status']);
      const res = await post(body, { 'X-Signature': sign(body), 'X-Felloh-Test': 'true' });
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Felloh test delivery');
    });

    it('acknowledges a verified delivery of an unknown shape', async () => {
      const body = JSON.stringify({ something: 'else' });
      const res = await post(body, { 'X-Signature': sign(body) });
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Unhandled Felloh delivery');
    });
  });

  describe('invalid signatures', () => {
    const body = JSON.stringify(PAYLOADS['transaction-status']);

    it('rejects a missing signature', async () => {
      expect((await post(body)).status).toBe(401);
    });

    it('rejects an empty signature', async () => {
      expect((await post(body, { 'X-Signature': '' })).status).toBe(401);
    });

    it('rejects a signature made with the wrong key', async () => {
      expect((await post(body, { 'X-Signature': sign(body, 'wrong_key') })).status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      const sig = sign(body);
      const tampered = JSON.stringify({ ...PAYLOADS['transaction-status'], amount: 1 });
      expect((await post(tampered, { 'X-Signature': sig })).status).toBe(401);
    });

    it('rejects a sha256= prefixed signature', async () => {
      expect((await post(body, { 'X-Signature': `sha256=${sign(body)}` })).status).toBe(401);
    });

    it('rejects a wrong-length signature', async () => {
      expect((await post(body, { 'X-Signature': sign(body).slice(0, 62) })).status).toBe(401);
    });

    it('rejects a non-hex signature of the right length', async () => {
      expect((await post(body, { 'X-Signature': 'z'.repeat(64) })).status).toBe(401);
    });

    it('rejects when the secret is not configured', () => {
      expect(verifyFellohSignature(Buffer.from(body), sign(body), '')).toBe(false);
    });
  });

  describe('payload handling after verification', () => {
    it('returns 400 for a signed body that is not JSON', async () => {
      const body = 'not json';
      expect((await post(body, { 'X-Signature': sign(body) })).status).toBe(400);
    });

    it('returns 400 for a signed JSON array', async () => {
      const body = JSON.stringify([1, 2]);
      expect((await post(body, { 'X-Signature': sign(body) })).status).toBe(400);
    });

    it('ignores wrong-typed nested fields without a 500', async () => {
      for (const p of [
        { user: 'x' },
        { transaction: 'x', status: 'COMPLETE' },
        { transaction: { id: 1 }, status: ['a'] },
        { booking: null },
      ]) {
        const body = JSON.stringify(p);
        const res = await post(body, { 'X-Signature': sign(body) });
        expect(res.status).toBe(200);
      }
    });
  });

  describe('classify', () => {
    it.each(Object.keys(PAYLOADS))('classifies %s', (name) => {
      expect(classify(PAYLOADS[name])).toBe(name);
    });
  });

  it('serves a health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
