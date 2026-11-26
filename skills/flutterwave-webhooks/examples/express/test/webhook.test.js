// Generated with: flutterwave-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Test-only secret hash (you choose it in Settings > Webhooks).
const SECRET_HASH = 'flw-test-secret-hash-7c1e';
process.env.FLUTTERWAVE_SECRET_HASH = SECRET_HASH;

const { app, verifyFlutterwaveWebhook } = require('../src/index');

/** Sign like Flutterwave v4: base64 HMAC-SHA256 of the raw body. */
const signV4 = (rawBody, secret = SECRET_HASH) =>
  crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');

let counter = 0;
const nextId = () => `wbk_test${Date.now().toString(36)}${++counter}`;

// v4 payloads, shaped like the samples on the v4 webhooks and payouts pages.
const v4Charge = (id = nextId()) =>
  JSON.stringify({
    id,
    timestamp: 1735116884019,
    type: 'charge.completed',
    data: {
      id: 'chg_Hq4oBRTJ4r',
      amount: 2500,
      currency: 'KES',
      customer: { id: 'cus_csm0pcQim4', email: 'customer@example.com' },
      reference: '49c3c6f5-aedd-4443-9eb4-92c51758f04a',
      status: 'succeeded',
    },
  });

const v4Transfer = () =>
  JSON.stringify({
    webhook_id: nextId(),
    timestamp: 1739877172874,
    type: 'transfer.disburse',
    data: { id: 'trf_yMZATJ11yVPNkZ', type: 'BANK', amount: 50000, status: 'SUCCESSFUL' },
  });

// v3 payloads from the v3 webhooks page.
const v3Charge = (status = 'successful') =>
  JSON.stringify({
    event: 'charge.completed',
    data: { id: 285959875, tx_ref: 'Links-616626414629', amount: 100, currency: 'NGN', status },
    'event.type': 'CARD_TRANSACTION',
  });

const v3VirtualCard = JSON.stringify({
  TransactionId: '9998d447-9159-4591-9661-aa7f1458d91b',
  MerchantName: 'Flutterwave',
  Description: 'CHARGE',
  Status: 'Successful',
  Amount: 0.2075,
  Type: 'Debit',
  CardId: 'ccb40595-eaad-4a8f-bb9a-74ae245b12bb',
});

const post = (rawBody, headers) =>
  request(app)
    .post('/webhooks/flutterwave')
    .set({ 'content-type': 'application/json', ...headers })
    .send(rawBody);

beforeEach(() => {
  process.env.FLUTTERWAVE_SECRET_HASH = SECRET_HASH;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('verifyFlutterwaveWebhook', () => {
  it('matches the documented test vector', () => {
    const body =
      '{"webhook_id":"wbk_test0001","timestamp":1739877172874,"type":"charge.completed","data":{"id":"chg_test0001","status":"succeeded"}}';
    const headers = { 'flutterwave-signature': 'XyZb/PVeYo0px7D4KQpa/nS7KkPGH1fK7X84YdQO2Ms=' };
    expect(verifyFlutterwaveWebhook(body, headers, SECRET_HASH)).toBe('v4');
    expect(verifyFlutterwaveWebhook(Buffer.from(body), headers, SECRET_HASH)).toBe('v4');
  });

  it('returns v3 for a matching verif-hash and null otherwise', () => {
    expect(verifyFlutterwaveWebhook('{}', { 'verif-hash': SECRET_HASH }, SECRET_HASH)).toBe('v3');
    expect(verifyFlutterwaveWebhook('{}', { 'verif-hash': 'nope' }, SECRET_HASH)).toBeNull();
    expect(verifyFlutterwaveWebhook('{}', {}, SECRET_HASH)).toBeNull();
    expect(verifyFlutterwaveWebhook('{}', { 'verif-hash': SECRET_HASH }, '')).toBeNull();
  });
});

describe('v4 (flutterwave-signature)', () => {
  it('accepts charge.completed with a valid signature', async () => {
    const body = v4Charge();
    const res = await post(body, { 'flutterwave-signature': signV4(body) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, version: 'v4' });
    expect(console.log).toHaveBeenCalledWith('Charge chg_Hq4oBRTJ4r succeeded: 2500 KES');
  });

  it('accepts transfer.disburse (webhook_id form of the ID)', async () => {
    const body = v4Transfer();
    const res = await post(body, { 'flutterwave-signature': signV4(body) });
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith('Transfer trf_yMZATJ11yVPNkZ SUCCESSFUL');
  });

  it('rejects a signature made with another secret', async () => {
    const body = v4Charge();
    const res = await post(body, { 'flutterwave-signature': signV4(body, 'some-other-secret') });
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const body = v4Charge();
    const res = await post(body.replace('2500', '250000'), { 'flutterwave-signature': signV4(body) });
    expect(res.status).toBe(401);
  });

  it('rejects a hex digest (the signature is base64)', async () => {
    const body = v4Charge();
    const hex = crypto.createHmac('sha256', SECRET_HASH).update(body).digest('hex');
    const res = await post(body, { 'flutterwave-signature': hex });
    expect(res.status).toBe(401);
  });

  it('rejects the secret hash itself in flutterwave-signature (the framework examples)', async () => {
    const res = await post(v4Charge(), { 'flutterwave-signature': SECRET_HASH });
    expect(res.status).toBe(401);
  });

  it('does not fall back to verif-hash when a v4 signature is present but wrong', async () => {
    const body = v4Charge();
    const res = await post(body, { 'flutterwave-signature': signV4(body, 'wrong'), 'verif-hash': SECRET_HASH });
    expect(res.status).toBe(401);
  });

  it('returns 200 duplicate for a repeated webhook ID', async () => {
    const body = v4Charge('wbk_duplicate_check_1');
    const headers = { 'flutterwave-signature': signV4(body) };
    expect((await post(body, headers)).status).toBe(200);
    const again = await post(body, headers);
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ received: true, duplicate: true });
  });

  it('acknowledges an unknown type with 200', async () => {
    const body = JSON.stringify({ webhook_id: nextId(), timestamp: 1, type: 'order.authorization', data: {} });
    const res = await post(body, { 'flutterwave-signature': signV4(body) });
    expect(res.status).toBe(200);
  });
});

describe('v3 (verif-hash)', () => {
  it('accepts charge.completed with a matching verif-hash', async () => {
    const res = await post(v3Charge(), { 'verif-hash': SECRET_HASH });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, version: 'v3' });
    expect(console.log).toHaveBeenCalledWith('Charge 285959875 successful: 100 NGN');
  });

  it('accepts a virtual card payload with no event field', async () => {
    const res = await post(v3VirtualCard, { 'verif-hash': SECRET_HASH });
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Virtual card ccb40595'));
  });

  it('rejects a wrong verif-hash', async () => {
    const res = await post(v3Charge(), { 'verif-hash': 'wrong-hash' });
    expect(res.status).toBe(401);
  });

  it('dedupes on event + data.id + data.status', async () => {
    const body = v3Charge('failed');
    await post(body, { 'verif-hash': SECRET_HASH });
    const again = await post(body, { 'verif-hash': SECRET_HASH });
    expect(again.body).toEqual({ received: true, duplicate: true });
  });
});

describe('other failures', () => {
  it('rejects a request with neither header', async () => {
    expect((await post(v4Charge(), {})).status).toBe(401);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"type": "charge.completed",';
    const res = await post(body, { 'flutterwave-signature': signV4(body) });
    expect(res.status).toBe(400);
  });

  it('returns 500 when FLUTTERWAVE_SECRET_HASH is not set', async () => {
    delete process.env.FLUTTERWAVE_SECRET_HASH;
    const body = v4Charge();
    const res = await post(body, { 'flutterwave-signature': signV4(body) });
    expect(res.status).toBe(500);
  });
});
