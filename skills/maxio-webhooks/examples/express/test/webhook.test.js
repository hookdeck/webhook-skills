const request = require('supertest');
const crypto = require('crypto');

const SHARED_KEY = '123'; // Maxio uses the Site Shared Key as a raw string
process.env.MAXIO_SHARED_KEY = SHARED_KEY;

const { app, verifyMaxio } = require('../src/index');

const HEADER = 'X-Chargify-Webhook-Signature-Hmac-Sha-256';

function sign(body, key = SHARED_KEY) {
  return crypto.createHmac('sha256', key).update(body).digest('hex');
}

function post(body, signature) {
  const req = request(app)
    .post('/webhooks/maxio')
    .set('Content-Type', 'application/x-www-form-urlencoded');
  if (signature !== undefined) req.set(HEADER, signature);
  return req.send(body);
}

describe('Maxio webhook verification', () => {
  const vectorBody = 'payload[chargify]=testing&event=test';
  const vectorSig = '19826d51b9f866b26eda1f154de192593360f8d0bcb63df8a28540a5dcf733f1';

  it('matches the documented test vector', () => {
    expect(sign(vectorBody)).toBe(vectorSig);
    expect(verifyMaxio(Buffer.from(vectorBody), vectorSig, '123')).toBe(true);
  });

  it('accepts the test vector over HTTP', async () => {
    const res = await post(vectorBody, vectorSig);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it.each([
    'signup_success',
    'payment_success',
    'payment_failure',
    'renewal_success',
    'subscription_state_change',
  ])('accepts a signed %s event', async (event) => {
    const body = `payload[subscription][id]=42&event=${event}`;
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  it('accepts an uppercase hex signature', async () => {
    const res = await post(vectorBody, vectorSig.toUpperCase());
    expect(res.status).toBe(200);
  });

  it('rejects an invalid signature', async () => {
    const res = await post(vectorBody, 'a'.repeat(64));
    expect(res.status).toBe(400);
  });

  it('rejects a signature of the wrong length', async () => {
    const res = await post(vectorBody, 'abcd');
    expect(res.status).toBe(400);
  });

  it('rejects a missing signature header', async () => {
    const res = await post(vectorBody);
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const res = await post('payload[chargify]=evil&event=test', vectorSig);
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with the wrong key', async () => {
    const res = await post(vectorBody, sign(vectorBody, 'wrong'));
    expect(res.status).toBe(400);
  });
});
