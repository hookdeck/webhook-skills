const request = require('supertest');
const crypto = require('crypto');

// The callback_token is any string you choose when creating the subscription
process.env.SALESLOFT_CALLBACK_TOKEN = 'test_callback_token';

const { app, verifySalesloftSignature } = require('../src/index');

const TOKEN = process.env.SALESLOFT_CALLBACK_TOKEN;

/**
 * Sign like Salesloft: hex(HMAC-SHA1(callback_token, rawBody))
 */
function sign(content, token = TOKEN) {
  return crypto.createHmac('sha1', token).update(content, 'utf8').digest('hex');
}

const personCreated = { id: 'evt-1', callback_token: TOKEN, data: { id: 101, email_address: 'a@example.com' } };

function post(body, { signature, event, contentType = 'application/json' } = {}) {
  const req = request(app).post('/webhooks/salesloft').set('Content-Type', contentType);
  if (signature) req.set('x-salesloft-signature', signature);
  if (event) req.set('x-salesloft-event', event);
  return req.send(body);
}

describe('verifySalesloftSignature', () => {
  it('accepts a valid signature over the raw body', () => {
    const body = JSON.stringify(personCreated);
    expect(verifySalesloftSignature(Buffer.from(body), sign(body), TOKEN)).toBe(true);
  });

  it('produces a 40-char hex HMAC-SHA1 digest', () => {
    expect(sign('{}')).toMatch(/^[a-f0-9]{40}$/);
  });

  it('rejects a SHA-256 signature', () => {
    const body = JSON.stringify(personCreated);
    const sha256 = crypto.createHmac('sha256', TOKEN).update(body).digest('hex');
    expect(verifySalesloftSignature(Buffer.from(body), sha256, TOKEN)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const body = JSON.stringify(personCreated);
    expect(verifySalesloftSignature(Buffer.from(body + ' '), sign(body), TOKEN)).toBe(false);
  });

  it('rejects the wrong token', () => {
    const body = JSON.stringify(personCreated);
    expect(verifySalesloftSignature(Buffer.from(body), sign(body, 'other'), TOKEN)).toBe(false);
  });

  it('rejects missing signature or token and a length mismatch', () => {
    const body = Buffer.from('{}');
    expect(verifySalesloftSignature(body, undefined, TOKEN)).toBe(false);
    expect(verifySalesloftSignature(body, sign('{}'), undefined)).toBe(false);
    expect(verifySalesloftSignature(body, 'abc', TOKEN)).toBe(false);
  });
});

describe('POST /webhooks/salesloft', () => {
  it.each([
    'person_created',
    'person_updated',
    'call_created',
    'email_updated',
    'meeting_booked',
    'cadence_membership_created',
  ])('accepts a signed %s event', async (event) => {
    const body = JSON.stringify(personCreated);
    const res = await post(body, { signature: sign(body), event });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('verifies regardless of content type', async () => {
    const body = JSON.stringify(personCreated);
    const res = await post(body, {
      signature: sign(body),
      event: 'person_created',
      contentType: 'text/plain',
    });
    expect(res.status).toBe(200);
  });

  it('accepts an unknown event type once verified', async () => {
    const body = JSON.stringify(personCreated);
    const res = await post(body, { signature: sign(body), event: 'something_new' });
    expect(res.status).toBe(200);
  });

  it('returns 400 when the signature header is missing', async () => {
    const res = await post(JSON.stringify(personCreated), { event: 'person_created' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await post(JSON.stringify(personCreated), {
      signature: 'a'.repeat(40),
      event: 'person_created',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await post(body, { signature: sign(body), event: 'person_created' });
    expect(res.status).toBe(400);
  });
});
