const crypto = require('crypto');
const request = require('supertest');

// Example from the Zenefits docs
const DOC_SECRET = 'lDVtBQnoRcqYv4fUeVD0oyzgsKWHGtqhatjBX5wXRFQzkVUCzBA571E4qUxvR5LE';
const DOC_BODY = '{"test":"valid payload"}';
const DOC_SIGNATURE = '219a08ea32f319931dc849badc076323f40367aad859ddba4de82e33135fad31';

process.env.ZENEFITS_WEBHOOK_SECRET = DOC_SECRET;

const { app, verifyZenefitsSignature } = require('../src/index');

// Same algorithm as Zenefits: hex(HMAC-SHA256(body, secret))
function sign(body, secret = DOC_SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function post(body, signature, contentType = 'application/json') {
  const req = request(app).post('/webhooks/zenefits').set('Content-Type', contentType);
  if (signature !== undefined) req.set('signature', signature);
  return req.send(body);
}

const event = (type) =>
  JSON.stringify({ object: '/meta/event', type, data: { id: '1', object: '/core/people' } });

describe('verifyZenefitsSignature', () => {
  test('matches the example in the Zenefits docs', () => {
    expect(sign(DOC_BODY)).toBe(DOC_SIGNATURE);
    expect(verifyZenefitsSignature(Buffer.from(DOC_BODY), DOC_SIGNATURE, DOC_SECRET)).toBe(true);
  });

  test('accepts an uppercase hex signature', () => {
    expect(verifyZenefitsSignature(Buffer.from(DOC_BODY), DOC_SIGNATURE.toUpperCase(), DOC_SECRET)).toBe(true);
  });

  test('rejects wrong secret, missing header, short, long, and non-hex values', () => {
    const body = Buffer.from(DOC_BODY);
    expect(verifyZenefitsSignature(body, sign(body, 'other'), DOC_SECRET)).toBe(false);
    expect(verifyZenefitsSignature(body, undefined, DOC_SECRET)).toBe(false);
    expect(verifyZenefitsSignature(body, 'short', DOC_SECRET)).toBe(false);
    expect(verifyZenefitsSignature(body, DOC_SIGNATURE + '00', DOC_SECRET)).toBe(false);
    // 64 chars but invalid hex must not be truncated into a shorter buffer
    expect(verifyZenefitsSignature(body, 'zz' + DOC_SIGNATURE.slice(2), DOC_SECRET)).toBe(false);
    expect(verifyZenefitsSignature(body, DOC_SIGNATURE, '')).toBe(false);
  });
});

describe('POST /webhooks/zenefits', () => {
  test('accepts a valid signature and handles known events', async () => {
    for (const type of [
      'companies.did_change',
      'people.did_create',
      'people.did_change',
      'employments.did_start',
      'employments.did_terminate',
      'flow.did_complete.hiring',
    ]) {
      const body = event(type);
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    }
  });

  test('accepts unhandled event types with a valid signature', async () => {
    const body = event('departments.did_create');
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  test('verifies regardless of content type', async () => {
    const body = event('people.did_create');
    const res = await post(body, sign(body), 'text/plain');
    expect(res.status).toBe(200);
  });

  test('rejects an invalid signature', async () => {
    const res = await post(event('people.did_create'), sign('tampered'));
    expect(res.status).toBe(401);
  });

  test('rejects a missing signature header', async () => {
    const res = await post(event('people.did_create'));
    expect(res.status).toBe(401);
  });

  test('rejects a body modified after signing', async () => {
    const signature = sign(event('people.did_create'));
    const res = await post(event('people.did_change'), signature);
    expect(res.status).toBe(401);
  });

  test('returns 400 for a signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await post(body, sign(body), 'text/plain');
    expect(res.status).toBe(400);
  });
});
