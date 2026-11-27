const crypto = require('crypto');
const request = require('supertest');

process.env.PAYMOB_HMAC_SECRET = 'test_hmac_secret';

const { app, buildSignedString, verifyPaymobHmac, transactionState } = require('../src/index');

const SECRET = process.env.PAYMOB_HMAC_SECRET;

// The signed fields of the transaction in Paymob's HMAC transaction callback example
// (other fields omitted). The docs print the concatenated string below for it.
function makeObj(overrides = {}) {
  return {
    id: 192036465,
    pending: false,
    amount_cents: 100000,
    success: true,
    is_auth: false,
    is_capture: false,
    is_standalone_payment: true,
    is_voided: false,
    is_refunded: false,
    is_3d_secure: true,
    integration_id: 4097558,
    has_parent_transaction: false,
    order: { id: 217503754 },
    created_at: '2024-06-13T11:33:44.592345',
    currency: 'EGP',
    source_data: { pan: '2346', type: 'card', sub_type: 'MasterCard' },
    error_occured: false,
    owner: 302852,
    ...overrides,
  };
}
const DOC_TRANSACTION_STRING =
  '1000002024-06-13T11:33:44.592345EGPfalsefalse1920364654097558truefalsefalsefalsetruefalse217503754302852false2346MasterCardcardtrue';

// Paymob's card token callback example, with the HMAC secret and digest its HMAC page prints.
const DOC_TOKEN = {
  type: 'TOKEN',
  obj: {
    id: 17233884,
    token: '0c045bd5330aa3d666d72830d4bcf0e60e10902df9fb2340af978bbf',
    masked_pan: 'xxxx-xxxx-xxxx-2346',
    merchant_id: 164295,
    card_subtype: 'MasterCard',
    created_at: '2026-11-16T10:44:52.523591',
    email: 'example.test@example.com',
    order_id: '655608785',
    user_added: false,
    next_payment_intention: 'pi_test_243ec1d9c065458e8f61adad564d3d10',
    cardholder_name: 'TEST ACCOUNT',
    expiry_month: '01',
    expiry_year: '39',
    card_funding_type: 'CREDIT',
  },
};
const DOC_TOKEN_SECRET = '04DC1A9490B8CC2094C011FC055ADCDB';
const DOC_TOKEN_HMAC =
  '57982fed57b47d82ddaf9b104a6b75acb35fed1bb629ed29959b88db2699dda5dc7845423a5f58f8dc6dd794b3727e5fb28b95d896dfce5dd9d3b2845c4a04e4';

function sign(type, obj, secret = SECRET) {
  return crypto.createHmac('sha512', secret).update(buildSignedString(type, obj)).digest('hex');
}

function post(body, hmac) {
  const r = request(app).post('/webhooks/paymob');
  if (hmac !== undefined) r.query({ hmac });
  return r.set('Content-Type', 'application/json').send(body);
}

describe('Paymob webhook handler', () => {
  it("reproduces the docs' transaction concatenated string", () => {
    expect(buildSignedString('TRANSACTION', makeObj())).toBe(DOC_TRANSACTION_STRING);
  });

  it("verifies the docs' card token example", () => {
    expect(verifyPaymobHmac(DOC_TOKEN, DOC_TOKEN_HMAC, DOC_TOKEN_SECRET)).toBe(true);
  });

  it('accepts a transaction callback with a valid HMAC', async () => {
    const obj = makeObj();
    const res = await post({ type: 'TRANSACTION', obj }, sign('TRANSACTION', obj));
    expect(res.status).toBe(200);
  });

  it('accepts a card token callback with a valid HMAC', async () => {
    const res = await post(DOC_TOKEN, sign('TOKEN', DOC_TOKEN.obj));
    expect(res.status).toBe(200);
  });

  it('rejects an invalid HMAC', async () => {
    const res = await post({ type: 'TRANSACTION', obj: makeObj() }, 'deadbeef');
    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid signature');
  });

  it('rejects a callback without the hmac parameter', async () => {
    const res = await post({ type: 'TRANSACTION', obj: makeObj() });
    expect(res.status).toBe(400);
  });

  it('rejects a tampered payload (amount changed after signing)', async () => {
    const hmac = sign('TRANSACTION', makeObj());
    const res = await post({ type: 'TRANSACTION', obj: makeObj({ amount_cents: 1 }) }, hmac);
    expect(res.status).toBe(400);
  });

  it('rejects a card token signed with the transaction keys', async () => {
    const res = await post(DOC_TOKEN, sign('TRANSACTION', DOC_TOKEN.obj));
    expect(res.status).toBe(400);
  });

  it('rejects an unknown type', async () => {
    const res = await post({ type: 'SOMETHING_ELSE', obj: {} }, 'abc');
    expect(res.status).toBe(400);
  });

  it('derives the transaction state from boolean fields', () => {
    expect(transactionState(makeObj())).toBe('succeeded');
    expect(transactionState(makeObj({ success: false, pending: false }))).toBe('declined');
    expect(transactionState(makeObj({ success: false, pending: true }))).toBe('pending');
    expect(transactionState(makeObj({ is_auth: true, is_capture: false }))).toBe('authorized');
    expect(transactionState(makeObj({ is_refunded: true }))).toBe('refunded');
    expect(transactionState(makeObj({ is_voided: true }))).toBe('voided');
  });
});
