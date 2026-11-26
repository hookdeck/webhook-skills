// Generated with: monnify-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Synthetic secret
const SECRET = 'MONNIFYSYNTHETICCLIENTSECRET0001';
process.env.MONNIFY_CLIENT_SECRET = SECRET;

const { app, verifyMonnifySignature } = require('../src/index');

const BODY = '{"eventType":"SUCCESSFUL_TRANSACTION","eventData":{"product":{"reference":"SYNTH-ORDER-0001","type":"WEB_SDK"},"transactionReference":"MNFY|20261118101500|000001","paymentReference":"SYNTH-ORDER-0001","paidOn":"2026-11-18 10:15:00.0","paymentDescription":"Synthetic order","amountPaid":"1500.00","totalPayable":"1500.00","paymentMethod":"ACCOUNT_TRANSFER","currency":"NGN","settlementAmount":"1490.00","paymentStatus":"PAID","customer":{"name":"Test Customer","email":"customer@example.com"}}}';
const BODY2 = '{"eventType":"SUCCESSFUL_REFUND","eventData":{"transactionReference":"MNFY|20261118101500|000001","refundReference":"SYNTH-REFUND-0001","refundAmount":"1500.00","refundStatus":"COMPLETED"}}';

const sign = (body, key = SECRET) => '' + crypto.createHmac('sha512', key).update(body).digest('hex');

const post = (body, signature, headers = {}) => {
  const req = request(app).post('/webhooks/monnify').set('Content-Type', 'application/json').set(headers);
  if (signature !== undefined) req.set('monnify-signature', signature);
  return req.send(body);
};

beforeEach(() => {
  process.env.MONNIFY_CLIENT_SECRET = SECRET;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('verifyMonnifySignature', () => {
  it('accepts a signature over the raw body', () => {
    expect(verifyMonnifySignature(BODY, sign(BODY), SECRET)).toBe(true);
  });

  it('rejects a base64 digest: Monnify sends hex', () => {
    const other = '' + crypto.createHmac('sha512', SECRET).update(BODY).digest('base64');
    expect(verifyMonnifySignature(BODY, other, SECRET)).toBe(false);
  });

  it('rejects plain SHA-512 of secret + body (the docs prose): Monnify uses HMAC', () => {
    const plain = crypto.createHash('sha512').update(SECRET + BODY).digest('hex');
    expect(verifyMonnifySignature(BODY, plain, SECRET)).toBe(false);
  });

  it('rejects an HMAC-SHA256 value', () => {
    const sha256 = crypto.createHmac('sha256', SECRET).update(BODY).digest('hex');
    expect(verifyMonnifySignature(BODY, sha256, SECRET)).toBe(false);
  });
});

describe('/webhooks/monnify', () => {

  it('accepts a valid signature', async () => {
    const res = await post(BODY, sign(BODY));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, event_type: 'SUCCESSFUL_TRANSACTION', reference: 'MNFY|20261118101500|000001' });
  });

  it('handles a second event type', async () => {
    const res = await post(BODY2, sign(BODY2));
    expect(res.status).toBe(200);
    expect(res.body.event_type).toBe('SUCCESSFUL_REFUND');
  });

  it('rejects a signature made with another secret', async () => {
    expect((await post(BODY, sign(BODY, 'wrong_secret'))).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    expect((await post(BODY.replace('"amountPaid":"1500.00"', '"amountPaid":"15000.00"'), sign(BODY))).status).toBe(401);
  });

  it('rejects a missing signature header', async () => {
    expect((await post(BODY)).status).toBe(401);
  });

  it('rejects an unsigned request, as the sandbox sends', async () => {
    expect((await post(BODY)).status).toBe(401);
  });
  it('accepts a secret with a trailing newline', async () => {
    process.env.MONNIFY_CLIENT_SECRET = `${SECRET}\n`;
    expect((await post(BODY, sign(BODY))).status).toBe(200);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"truncated": ';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('returns 500 when MONNIFY_CLIENT_SECRET is not set', async () => {
    delete process.env.MONNIFY_CLIENT_SECRET;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });
});
