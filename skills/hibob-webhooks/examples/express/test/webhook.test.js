const crypto = require('crypto');
const request = require('supertest');

const SECRET = 'test_bob_webhook_secret'; // Bob secrets are used as raw strings
process.env.HIBOB_WEBHOOK_SECRET = SECRET;

const { app, verifyBobSignature } = require('../src/index');

// Same algorithm as Bob: base64(HMAC-SHA512(body, secret))
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha512', secret).update(body).digest('base64');
}

function post(body, signature) {
  const req = request(app).post('/webhooks/hibob').set('Content-Type', 'application/json');
  if (signature) req.set('Bob-Signature', signature);
  return req.send(body);
}

const event = (type) =>
  JSON.stringify({
    companyId: 1,
    version: 'v2',
    type,
    triggeredBy: 'system',
    triggeredAt: '2026-01-01T00:00:00Z',
    data: { employeeId: '3332' },
  });

describe('verifyBobSignature', () => {
  test('accepts a valid signature', () => {
    const body = Buffer.from(event('employee.created'));
    expect(verifyBobSignature(body, sign(body), SECRET)).toBe(true);
  });

  test('rejects wrong secret, missing header, and length mismatch', () => {
    const body = Buffer.from(event('employee.created'));
    expect(verifyBobSignature(body, sign(body, 'other'), SECRET)).toBe(false);
    expect(verifyBobSignature(body, undefined, SECRET)).toBe(false);
    expect(verifyBobSignature(body, 'short', SECRET)).toBe(false);
  });
});

describe('POST /webhooks/hibob', () => {
  test.each([
    'employee.created',
    'employee.updated',
    'employee.joined',
    'employee.left',
    'timeoff.request.requested',
    'timeoff.request.approved',
    'employee.deleted',
  ])('accepts a signed %s event', async (type) => {
    const body = event(type);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  test('rejects an invalid signature', async () => {
    const res = await post(event('employee.created'), 'invalid');
    expect(res.status).toBe(400);
  });

  test('rejects a missing signature', async () => {
    const res = await post(event('employee.created'));
    expect(res.status).toBe(400);
  });

  test('rejects a signature made over a different body', async () => {
    const res = await post(event('employee.created'), sign(event('employee.left')));
    expect(res.status).toBe(400);
  });

  test('rejects a validly signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await post(body, sign(body));
    expect(res.status).toBe(400);
  });

  test('answers the JSON ping test with 200', async () => {
    const res = await post(JSON.stringify({ text: 'Ping test' }));
    expect(res.status).toBe(200);
  });

  test('answers the plain text ping test with 200', async () => {
    const res = await request(app)
      .post('/webhooks/hibob')
      .set('Content-Type', 'text/plain')
      .send('Ping test');
    expect(res.status).toBe(200);
  });
});
