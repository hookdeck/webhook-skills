const request = require('supertest');
const crypto = require('crypto');

// SpherePay endpoint secrets look like whsec_...; the whole string is the HMAC key
const SECRET = 'whsec_test_secret_for_unit_tests_0123456789';
process.env.SPHEREPAY_WEBHOOK_SECRET = SECRET;

const { app, verifySpherePay, computeSignature } = require('../src/index');

// Published vector from SpherePay's docs (verified against Hookdeck's SPHEREPAY source template)
const VECTOR = {
  secret: 'whsec_9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c',
  body: '{"id":"event_01HXPA3M9R7DEF456","type":"transfer.succeeded","apiVersion":"v2","originalCreateDate":"2026-08-07T14:05:30.000Z","livemode":true,"sequence":5,"data":{"id":"payout_d243ab2b1de4447d8a046d87fefe58cf","type":"transfer","applicationId":"application_1324354657","customerId":"customer_f31121c389624d3697cbf3ea8830b7a4","transferType":"oneTimeTransfer","previousStatus":"processing","previousStatusAt":"2026-08-07T14:02:15.000Z","status":"succeeded","statusAt":"2026-08-07T14:05:30.000Z"}}',
  headers: {
    'sphere-timestamp': '1786111531',
    'sphere-signature': '4f04e86648d8f1341d431b4cfa00eaeb7c69b7b3fcee7dff97b24f95482a6be2',
  },
};

// Payloads as shown in SpherePay's event catalog
const customerApproved = JSON.stringify({
  id: 'event_01HXP9ZK7Q4ABC123',
  type: 'customer.approved',
  apiVersion: 'v2',
  originalCreateDate: '2026-08-07T14:00:00.123456Z',
  livemode: true,
  sequence: 3,
  data: {
    id: 'customer_f31121c389624d3697cbf3ea8830b7a4',
    type: 'customer',
    applicationId: 'application_1324354657',
    verificationProfile: 'kyc_profile_a',
    previousStatus: 'pending',
    previousStatusAt: '2026-08-06T10:15:30.000Z',
    status: 'approved',
    statusAt: '2026-08-07T14:00:00.000Z',
  },
});
const transferSucceeded = VECTOR.body;

const now = () => String(Math.floor(Date.now() / 1000));

function sign(body, timestamp = now(), secret = SECRET) {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(`${timestamp}.`), Buffer.isBuffer(body) ? body : Buffer.from(body)]))
    .digest('hex');
  return { 'Sphere-Timestamp': timestamp, 'Sphere-Signature': signature };
}

function post(body, headers, contentType = 'application/json') {
  return request(app)
    .post('/webhooks/spherepay')
    .set('Content-Type', contentType)
    .set(headers)
    .send(body);
}

afterEach(() => {
  delete process.env.SPHEREPAY_WEBHOOK_TOLERANCE_SECONDS;
  process.env.SPHEREPAY_WEBHOOK_SECRET = SECRET;
});

describe('published test vector', () => {
  it('computes the documented signature', () => {
    expect(computeSignature(Buffer.from(VECTOR.body), VECTOR.headers['sphere-timestamp'], VECTOR.secret)).toBe(
      '4f04e86648d8f1341d431b4cfa00eaeb7c69b7b3fcee7dff97b24f95482a6be2'
    );
  });

  it('verifier accepts the vector headers and secret (no timestamp window by default)', () => {
    expect(verifySpherePay(Buffer.from(VECTOR.body), VECTOR.headers, VECTOR.secret)).toBe(true);
  });

  it('rejects the vector under the wrong secret', () => {
    expect(verifySpherePay(Buffer.from(VECTOR.body), VECTOR.headers, SECRET)).toBe(false);
  });

  it('rejects the vector when the secret is used without its whsec_ prefix', () => {
    expect(verifySpherePay(Buffer.from(VECTOR.body), VECTOR.headers, VECTOR.secret.slice('whsec_'.length))).toBe(false);
  });
});

describe('SpherePay webhook handler', () => {
  it('accepts a signed customer.approved event', async () => {
    const res = await post(customerApproved, sign(customerApproved));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts a signed transfer.succeeded event', async () => {
    const res = await post(transferSucceeded, sign(transferSucceeded));
    expect(res.status).toBe(200);
  });

  it('accepts the published vector over HTTP', async () => {
    process.env.SPHEREPAY_WEBHOOK_SECRET = VECTOR.secret;
    const res = await post(VECTOR.body, VECTOR.headers);
    expect(res.status).toBe(200);
  });

  it('accepts any content type, since the raw bytes are what is signed', async () => {
    const res = await post(transferSucceeded, sign(transferSucceeded), 'text/plain');
    expect(res.status).toBe(200);
  });

  it('accepts an uppercase hex signature', async () => {
    const headers = sign(transferSucceeded);
    headers['Sphere-Signature'] = headers['Sphere-Signature'].toUpperCase();
    expect((await post(transferSucceeded, headers)).status).toBe(200);
  });

  it('verifies the exact bytes, not a re-serialised body', async () => {
    const pretty = JSON.stringify(JSON.parse(transferSucceeded), null, 2);
    expect((await post(pretty, sign(pretty))).status).toBe(200);
    // Signature over the compact form does not cover the pretty-printed body
    expect((await post(pretty, sign(transferSucceeded))).status).toBe(401);
  });

  it('verifies raw bytes before decoding: non-UTF-8 signed body passes verification, then fails JSON parsing', async () => {
    const body = Buffer.from([0x7b, 0xff, 0xfe, 0x7d]);
    const res = await post(body, sign(body), 'application/octet-stream');
    expect(res.status).toBe(400);
  });

  it('returns 200 for events it does not handle', async () => {
    const body = JSON.stringify({ id: 'event_1', type: 'transfer.expired', sequence: 1, data: { id: 'payout_1' } });
    expect((await post(body, sign(body))).status).toBe(200);
  });

  it('returns 400 for a validly signed body that is not JSON', async () => {
    const body = 'not json';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const res = await post(transferSucceeded.replace('succeeded', 'failed'), sign(transferSucceeded));
    expect(res.status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    expect((await post(transferSucceeded, sign(transferSucceeded, now(), 'whsec_other'))).status).toBe(401);
  });

  it('rejects a signature over a different timestamp', async () => {
    const headers = sign(transferSucceeded);
    headers['Sphere-Timestamp'] = String(Number(headers['Sphere-Timestamp']) + 1);
    expect((await post(transferSucceeded, headers)).status).toBe(401);
  });

  it('rejects a missing signature header', async () => {
    const { 'Sphere-Timestamp': ts } = sign(transferSucceeded);
    expect((await post(transferSucceeded, { 'Sphere-Timestamp': ts })).status).toBe(401);
  });

  it('rejects a missing timestamp header', async () => {
    const { 'Sphere-Signature': sig } = sign(transferSucceeded);
    expect((await post(transferSucceeded, { 'Sphere-Signature': sig })).status).toBe(401);
  });

  it('rejects an empty signature header', async () => {
    const { 'Sphere-Timestamp': ts } = sign(transferSucceeded);
    expect((await post(transferSucceeded, { 'Sphere-Timestamp': ts, 'Sphere-Signature': '' })).status).toBe(401);
  });

  it.each([
    ['too short', 'abcd'],
    ['too long', 'a'.repeat(66)],
    ['non-hex characters', 'z'.repeat(64)],
    ['sha256= prefix', 'sha256=' + 'a'.repeat(64)],
    ['a list of digests', 'a'.repeat(64) + ',' + 'b'.repeat(64)],
  ])('rejects a malformed signature (%s) without throwing', async (_name, value) => {
    const { 'Sphere-Timestamp': ts } = sign(transferSucceeded);
    expect((await post(transferSucceeded, { 'Sphere-Timestamp': ts, 'Sphere-Signature': value })).status).toBe(401);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.SPHEREPAY_WEBHOOK_SECRET;
    expect((await post(transferSucceeded, sign(transferSucceeded))).status).toBe(500);
  });
});

describe('optional timestamp tolerance', () => {
  const old = String(Math.floor(Date.now() / 1000) - 3600);

  it('accepts an old timestamp by default (retries and replays keep the original)', async () => {
    expect((await post(transferSucceeded, sign(transferSucceeded, old))).status).toBe(200);
  });

  it('treats 0 as off', async () => {
    process.env.SPHEREPAY_WEBHOOK_TOLERANCE_SECONDS = '0';
    expect((await post(transferSucceeded, sign(transferSucceeded, old))).status).toBe(200);
  });

  it('rejects an old timestamp when a tolerance is set', async () => {
    process.env.SPHEREPAY_WEBHOOK_TOLERANCE_SECONDS = '300';
    expect((await post(transferSucceeded, sign(transferSucceeded, old))).status).toBe(401);
  });

  it('accepts a fresh timestamp when a tolerance is set', async () => {
    process.env.SPHEREPAY_WEBHOOK_TOLERANCE_SECONDS = '300';
    expect((await post(transferSucceeded, sign(transferSucceeded))).status).toBe(200);
  });

  it('rejects a non-numeric timestamp when a tolerance is set', async () => {
    process.env.SPHEREPAY_WEBHOOK_TOLERANCE_SECONDS = '300';
    expect((await post(transferSucceeded, sign(transferSucceeded, 'yesterday'))).status).toBe(401);
  });

  it('ignores an invalid tolerance value (check stays off)', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.SPHEREPAY_WEBHOOK_TOLERANCE_SECONDS = 'five minutes';
    expect((await post(transferSucceeded, sign(transferSucceeded, old))).status).toBe(200);
  });
});
