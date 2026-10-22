const request = require('supertest');
const crypto = require('crypto');

const SECRET = 'test-secret-key'; // Paysafe HMAC keys are used as raw UTF-8 strings
process.env.PAYSAFE_WEBHOOK_SECRET = SECRET;

const { app, verifyPaysafeWebhook } = require('../src/index');

function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('base64');
}

function makeEvent(eventName, extra = {}) {
  return JSON.stringify({
    payload: { id: 'a49ba790-9cc5-4502-9f4a-dccc72460cf1', status: 'COMPLETED' },
    attemptNumber: 1,
    type: 'PAYMENT_HANDLE',
    resourceId: 'a49ba790-9cc5-4502-9f4a-dccc72460cf1',
    links: [{ rel: 'payment_handle', href: 'https://api.paysafe.com/paymenthub/v1/paymenthandles/a49ba790' }],
    eventDate: '2026-01-15T10:00:00Z',
    eventName,
    ...extra,
  }, null, 2); // pretty-printed: the signature covers the exact bytes received
}

describe('verifyPaysafeWebhook', () => {
  const body = makeEvent('PAYMENT_HANDLE_COMPLETED');

  it('accepts a valid signature', () => {
    expect(verifyPaysafeWebhook(Buffer.from(body), sign(body), SECRET)).toBe(true);
  });

  it('rejects a wrong secret', () => {
    expect(verifyPaysafeWebhook(Buffer.from(body), sign(body, 'other'), SECRET)).toBe(false);
  });

  it('does not base64-decode the key', () => {
    const decodedKeySig = crypto
      .createHmac('sha256', Buffer.from(SECRET, 'base64'))
      .update(body)
      .digest('base64');
    expect(verifyPaysafeWebhook(Buffer.from(body), decodedKeySig, SECRET)).toBe(false);
  });

  it('rejects a modified body and a malformed signature', () => {
    expect(verifyPaysafeWebhook(Buffer.from(body + ' '), sign(body), SECRET)).toBe(false);
    expect(verifyPaysafeWebhook(Buffer.from(body), 'short', SECRET)).toBe(false);
    expect(verifyPaysafeWebhook(Buffer.from(body), undefined, SECRET)).toBe(false);
  });
});

describe('POST /webhooks/paysafe', () => {
  const post = (body, signature, contentType = 'application/json') => {
    const r = request(app).post('/webhooks/paysafe').set('Content-Type', contentType);
    if (signature) r.set('Signature', signature);
    return r.send(body);
  };

  it.each([
    'PAYMENT_HANDLE_COMPLETED',
    'PAYMENT_HANDLE_FAILED',
    'PAYMENT_COMPLETED',
    'SETTLEMENT_COMPLETED',
    'SOMETHING_NEW',
  ])('returns 200 for a valid %s event', async (eventName) => {
    const body = makeEvent(eventName);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  it('verifies regardless of content type', async () => {
    const body = makeEvent('PAYMENT_COMPLETED');
    const res = await post(body, sign(body), 'text/plain');
    expect(res.status).toBe(200);
  });

  it('returns 400 for an invalid signature', async () => {
    const body = makeEvent('PAYMENT_COMPLETED');
    const res = await post(body, sign(body, 'wrong-key'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when the Signature header is missing', async () => {
    const res = await post(makeEvent('PAYMENT_COMPLETED'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a validly signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await post(body, sign(body), 'text/plain');
    expect(res.status).toBe(400);
  });

  it('serves the health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
