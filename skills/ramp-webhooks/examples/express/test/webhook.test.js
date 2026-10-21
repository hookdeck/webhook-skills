const request = require('supertest');
const crypto = require('crypto');

// Ramp returns the secret as a raw string; it is used as-is (not decoded)
process.env.RAMP_WEBHOOK_SECRET = 'test_ramp_webhook_secret';

const { app, verifyRampSignature } = require('../src/index');

const SECRET = process.env.RAMP_WEBHOOK_SECRET;

/**
 * Sign like Ramp: hex(HMAC-SHA256(secret, rawBody))
 */
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

const clearedEvent = {
  id: 'evt_0b1c2d3e',
  type: 'transactions.cleared',
  created_at: '2026-10-21T10:15:00Z',
  business_id: 'biz_123',
  object: { id: 'a1b2c3d4-0000-0000-0000-000000000001' },
};

const verificationEvent = {
  type: 'webhooks.verification',
  challenge: 'challenge_abc123',
};

function post(body, signature) {
  const req = request(app)
    .post('/webhooks/ramp')
    .set('Content-Type', 'application/json');
  if (signature) req.set('X-Ramp-Signature', signature);
  return req.send(body);
}

describe('verifyRampSignature', () => {
  it('accepts a valid signature', () => {
    const body = JSON.stringify(clearedEvent);
    expect(verifyRampSignature(Buffer.from(body), sign(body), SECRET)).toBe(true);
  });

  it('produces a 64-char hex HMAC-SHA256 digest', () => {
    expect(sign('{}')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects a tampered body', () => {
    const body = JSON.stringify(clearedEvent);
    const sig = sign(body);
    expect(verifyRampSignature(Buffer.from(body + ' '), sig, SECRET)).toBe(false);
  });

  it('rejects a wrong secret', () => {
    const body = JSON.stringify(clearedEvent);
    expect(verifyRampSignature(Buffer.from(body), sign(body, 'other'), SECRET)).toBe(false);
  });

  it('rejects a signature of the wrong length', () => {
    const body = JSON.stringify(clearedEvent);
    expect(verifyRampSignature(Buffer.from(body), 'abcd', SECRET)).toBe(false);
  });

  it('rejects missing signature or secret', () => {
    const body = Buffer.from('{}');
    expect(verifyRampSignature(body, undefined, SECRET)).toBe(false);
    expect(verifyRampSignature(body, sign('{}'), undefined)).toBe(false);
  });
});

describe('POST /webhooks/ramp', () => {
  it('accepts a signed transactions.cleared event', async () => {
    const body = JSON.stringify(clearedEvent);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts a signed webhooks.verification challenge', async () => {
    const body = JSON.stringify(verificationEvent);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  it.each([
    'transactions.authorized',
    'transactions.declined',
    'reimbursements.ready_for_review',
    'bills.created',
    'bills.approved',
    'bills.paid',
    'tests.test_event',
    'vendors.updated',
  ])('accepts a signed %s event', async (type) => {
    const body = JSON.stringify({ ...clearedEvent, type });
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature with 400', async () => {
    const res = await post(JSON.stringify(clearedEvent));
    expect(res.status).toBe(400);
  });

  it('rejects an invalid signature with 400', async () => {
    const body = JSON.stringify(clearedEvent);
    const res = await post(body, sign(body, 'wrong_secret'));
    expect(res.status).toBe(400);
  });

  it('rejects a signed but invalid JSON body with 400', async () => {
    const body = 'not json';
    const res = await post(body, sign(body));
    expect(res.status).toBe(400);
  });

  it('verifies the exact raw bytes, not re-serialized JSON', async () => {
    const body = '{ "id":"evt_1",  "type":"bills.paid", "object":{"id":"x"} }';
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });
});
