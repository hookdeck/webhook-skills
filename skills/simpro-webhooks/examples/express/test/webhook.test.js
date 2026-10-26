const request = require('supertest');
const crypto = require('crypto');

// Simpro secrets are any string you choose on the subscription
process.env.SIMPRO_WEBHOOK_SECRET = 'test_simpro_secret_long_random_value';

const { app, verifySimproSignature } = require('../src/index');

const SECRET = process.env.SIMPRO_WEBHOOK_SECRET;

/** Sign like Simpro: lowercase hex HMAC-SHA1 of the raw body */
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha1', secret).update(body).digest('hex');
}

const jobCreated = {
  ID: 'job.created',
  build: 'https://example.simprosuite.com',
  description: 'Job #42 has been created.',
  name: 'Job',
  action: 'created',
  reference: { companyID: 0, jobID: 42 },
  date_triggered: '2019-06-28T16:35:12+10:00',
};

const testEvent = {
  ID: 'test.updated',
  build: 'https://example.simprosuite.com',
  description: 'Test #1 has been updated.',
  name: 'Test',
  action: 'updated',
  reference: { testID: 1 },
  date_triggered: '2019-06-30T19:02:37-05:00',
};

function post(body, signature, contentType = 'application/json') {
  const req = request(app).post('/webhooks/simpro').set('Content-Type', contentType);
  if (signature) req.set('X-Response-Signature', signature);
  return req.send(body);
}

describe('verifySimproSignature', () => {
  const body = JSON.stringify(jobCreated);

  it('accepts a valid signature', () => {
    expect(verifySimproSignature(Buffer.from(body), sign(body), SECRET)).toBe(true);
  });

  it('produces a 40-char hex digest', () => {
    expect(sign(body)).toMatch(/^[a-f0-9]{40}$/);
  });

  it('accepts uppercase hex', () => {
    expect(verifySimproSignature(Buffer.from(body), sign(body).toUpperCase(), SECRET)).toBe(true);
  });

  it('rejects a tampered body', () => {
    expect(verifySimproSignature(Buffer.from(body + ' '), sign(body), SECRET)).toBe(false);
  });

  it('rejects the wrong secret', () => {
    expect(verifySimproSignature(Buffer.from(body), sign(body, 'other'), SECRET)).toBe(false);
  });

  it('rejects a SHA-256 signature', () => {
    const sha256 = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
    expect(verifySimproSignature(Buffer.from(body), sha256, SECRET)).toBe(false);
  });

  it('rejects a prefixed signature', () => {
    expect(verifySimproSignature(Buffer.from(body), `sha1=${sign(body)}`, SECRET)).toBe(false);
  });

  it('rejects invalid hex of the right length', () => {
    expect(verifySimproSignature(Buffer.from(body), 'zz'.repeat(20), SECRET)).toBe(false);
  });

  it('rejects a truncated signature', () => {
    expect(verifySimproSignature(Buffer.from(body), sign(body).slice(0, 20), SECRET)).toBe(false);
  });

  it('rejects missing signature or secret', () => {
    expect(verifySimproSignature(Buffer.from(body), undefined, SECRET)).toBe(false);
    expect(verifySimproSignature(Buffer.from(body), sign(body), undefined)).toBe(false);
  });
});

describe('POST /webhooks/simpro', () => {
  it('accepts a signed job.created event', async () => {
    const body = JSON.stringify(jobCreated);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts the Test Subscription event', async () => {
    const body = JSON.stringify(testEvent);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  it('accepts a signed body with any content type', async () => {
    const body = JSON.stringify(jobCreated);
    const res = await post(body, sign(body), 'text/plain');
    expect(res.status).toBe(200);
  });

  it('accepts an unknown event ID', async () => {
    const body = JSON.stringify({ ...jobCreated, ID: 'something.else' });
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  it('returns 401 when the signature header is missing', async () => {
    const res = await post(JSON.stringify(jobCreated));
    expect(res.status).toBe(401);
  });

  it('returns 401 for an invalid signature', async () => {
    const res = await post(JSON.stringify(jobCreated), 'a'.repeat(40));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the body was altered after signing', async () => {
    const signature = sign(JSON.stringify(jobCreated));
    const res = await post(JSON.stringify({ ...jobCreated, ID: 'job.deleted' }), signature);
    expect(res.status).toBe(401);
  });

  it('returns 400 for a signed non-JSON body', async () => {
    const body = 'not json';
    const res = await post(body, sign(body), 'text/plain');
    expect(res.status).toBe(400);
  });
});
