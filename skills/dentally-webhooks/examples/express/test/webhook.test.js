const request = require('supertest');
const crypto = require('crypto');

const SECRET = 'pLjUpNQu8a4YjeCrf2KseA';
process.env.DENTALLY_WEBHOOK_SECRET = SECRET;

const { app, verifyDentallySignature } = require('../src/index');

function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function payload(event, object = event.split('.')[0]) {
  return JSON.stringify({ data: { id: 2181 }, event, object, user: { id: 1 } });
}

describe('Dentally webhook handler', () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterAll(() => jest.restoreAllMocks());

  const events = [
    'appointment.created', 'appointment.updated', 'appointment.deleted',
    'patient.created', 'patient.updated', 'patient.deleted',
    'payment.created', 'payment.updated', 'payment.deleted',
  ];

  test.each(events)('accepts a validly signed %s event', async (event) => {
    const body = payload(event);
    const res = await request(app)
      .post('/webhooks/dentally')
      .set('Content-Type', 'application/json')
      .set('X-Dentally-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  test('verifies regardless of Content-Type', async () => {
    const body = payload('patient.updated');
    const res = await request(app)
      .post('/webhooks/dentally')
      .set('Content-Type', 'text/plain')
      .set('X-Dentally-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  test('accepts an uppercase hex signature', async () => {
    const body = payload('appointment.created');
    const res = await request(app)
      .post('/webhooks/dentally')
      .set('Content-Type', 'application/json')
      .set('X-Dentally-Signature', sign(body).toUpperCase())
      .send(body);
    expect(res.status).toBe(200);
  });

  test('returns 204 for unknown events', async () => {
    const body = payload('invoice.created');
    const res = await request(app)
      .post('/webhooks/dentally')
      .set('Content-Type', 'application/json')
      .set('X-Dentally-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(204);
  });

  test('rejects a missing signature header', async () => {
    const res = await request(app)
      .post('/webhooks/dentally')
      .set('Content-Type', 'application/json')
      .send(payload('appointment.created'));
    expect(res.status).toBe(400);
  });

  test('rejects a signature made with the wrong secret', async () => {
    const body = payload('appointment.created');
    const res = await request(app)
      .post('/webhooks/dentally')
      .set('Content-Type', 'application/json')
      .set('X-Dentally-Signature', sign(body, 'wrong-secret'))
      .send(body);
    expect(res.status).toBe(401);
  });

  test('rejects a tampered body', async () => {
    const body = payload('appointment.created');
    const res = await request(app)
      .post('/webhooks/dentally')
      .set('Content-Type', 'application/json')
      .set('X-Dentally-Signature', sign(body))
      .send(payload('appointment.deleted'));
    expect(res.status).toBe(401);
  });

  test.each([
    ['too short', 'abc123'],
    ['non-hex of right length', 'z'.repeat(64)],
    ['valid hex prefix with junk suffix', sign('x').slice(0, 60) + 'zzzz'],
    ['prefixed', 'sha256=' + sign('x')],
  ])('rejects a malformed signature (%s)', async (_name, sig) => {
    const res = await request(app)
      .post('/webhooks/dentally')
      .set('Content-Type', 'application/json')
      .set('X-Dentally-Signature', sig)
      .send(payload('appointment.created'));
    expect(res.status).toBe(401);
  });

  test('rejects invalid JSON that is correctly signed', async () => {
    const body = 'not json';
    const res = await request(app)
      .post('/webhooks/dentally')
      .set('Content-Type', 'application/json')
      .set('X-Dentally-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(400);
  });
});

describe('verifyDentallySignature', () => {
  test('accepts a correct digest', () => {
    const body = Buffer.from('{"a":1}');
    expect(verifyDentallySignature(body, sign(body), SECRET)).toBe(true);
  });

  test('rejects when no secret is configured', () => {
    const body = Buffer.from('{"a":1}');
    expect(verifyDentallySignature(body, sign(body), undefined)).toBe(false);
  });
});
