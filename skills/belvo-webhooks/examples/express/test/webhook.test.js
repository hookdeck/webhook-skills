const request = require('supertest');

const AUTH = 'Bearer 1b2c3d4e-5f60-4718-9a0b-c1d2e3f40516';
process.env.BELVO_AUTHORIZATION = AUTH;

const app = require('../src/index');
const { verifyBelvoRequest, classify } = require('../src/index');

// Shapes taken from Belvo's documented sample payloads (trimmed)
const paymentSuccess = {
  eventType: 'payment_request_update',
  eventCode: 'payment_request_successful',
  datetime: '2022-01-01T12:34:56.789Z',
  details: {
    id: '3118128a-6792-4b06-bd61-4acf6f6ad6b5',
    reference: 'your_reference_here',
    status: 'successful',
    amount: 100.5,
    failedReason: null,
    failedMessage: null,
  },
};
const paymentFailed = {
  eventType: 'payment_request_update',
  eventCode: 'payment_request_failed',
  datetime: '2022-01-01T12:34:56.789Z',
  details: { id: '3118128a-6792-4b06-bd61-4acf6f6ad6b5', status: 'failed', amount: 100.5, failedReason: 'insufficient_funds' },
};
const consentConfirmed = {
  eventType: 'consent_update',
  eventCode: 'consent_confirmed',
  datetime: '2025-10-30T12:34:56.789Z',
  details: { id: '4fa8f2b1-3c7d-4e9a-b5c6-111111111101', paymentMethodId: '4fa8f2b1-3c7d-4e9a-b5c6-111111111102', status: 'confirmed' },
};
const customerBlocked = {
  eventType: 'customer_update',
  eventCode: 'customer_blocked',
  datetime: '2025-10-30T12:34:56.789Z',
  details: { id: 'c1', documentNumber: 'XAXX010101000' },
};
const aggregation = {
  webhook_id: 'aadf41a1fc8e4f79a49f7f04027ac999',
  webhook_type: 'ACCOUNTS',
  webhook_code: 'new_accounts_available',
  link_id: '16f68516-bcbc-4cf7-b815-c500d4204e28',
  request_id: '4363b08b-51eb-4350-9c74-5df5ac92a7f6',
  external_id: 'your_external_id',
  data: {},
};
const aggregationError = {
  ...aggregation,
  webhook_type: 'TRANSACTIONS',
  webhook_code: 'historical_update',
  data: { errors: [{ code: 'operational_limits_reached', message: 'Operational Limit Reached' }] },
};

function post(body, headers = {}, contentType = 'application/json') {
  return request(app)
    .post('/webhooks/belvo')
    .set('Content-Type', contentType)
    .set(headers)
    .send(typeof body === 'string' ? body : JSON.stringify(body));
}

describe('Belvo webhook', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('accepts the full Authorization header value (Bearer)', async () => {
    const res = await post(paymentSuccess, { Authorization: AUTH });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts a Basic value when that is the configured credential', async () => {
    const basic = 'Basic ' + Buffer.from('belvo:s3cret').toString('base64');
    process.env.BELVO_AUTHORIZATION = basic;
    try {
      expect((await post(aggregation, { Authorization: basic })).status).toBe(200);
      expect((await post(aggregation, { Authorization: AUTH })).status).toBe(401);
    } finally {
      process.env.BELVO_AUTHORIZATION = AUTH;
    }
  });

  it('rejects a missing Authorization header', async () => {
    expect((await post(paymentSuccess)).status).toBe(401);
  });

  it('rejects a wrong token', async () => {
    const res = await post(paymentSuccess, { Authorization: 'Bearer 00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(401);
  });

  it('rejects the token without the "Bearer " prefix', async () => {
    const res = await post(paymentSuccess, { Authorization: AUTH.replace('Bearer ', '') });
    expect(res.status).toBe(401);
  });

  it('rejects a different scheme with the same token', async () => {
    const res = await post(paymentSuccess, { Authorization: AUTH.replace('Bearer', 'Basic') });
    expect(res.status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await post(JSON.stringify(paymentFailed), { Authorization: AUTH }, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await post('not json', { Authorization: AUTH })).status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    expect((await post('[1,2]', { Authorization: AUTH })).status).toBe(400);
  });

  it('accepts Payments and Aggregation payloads', async () => {
    for (const body of [paymentFailed, consentConfirmed, customerBlocked, aggregation, aggregationError]) {
      expect((await post(body, { Authorization: AUTH })).status).toBe(200);
    }
  });

  it('acknowledges unknown payloads', async () => {
    expect((await post({ foo: 1 }, { Authorization: AUTH })).status).toBe(200);
  });

  it('classifies both payload shapes', () => {
    expect(classify(paymentSuccess)).toEqual({ family: 'payments', code: 'payment_request_successful' });
    expect(classify(aggregation)).toEqual({ family: 'aggregation', code: 'new_accounts_available', type: 'ACCOUNTS' });
    expect(classify({ foo: 1 })).toBeNull();
  });

  it('never accepts when BELVO_AUTHORIZATION is unset', () => {
    expect(verifyBelvoRequest({ authorization: 'Bearer x' }, {})).toBe(false);
    expect(verifyBelvoRequest({ authorization: '' }, { BELVO_AUTHORIZATION: '' })).toBe(false);
  });
});
