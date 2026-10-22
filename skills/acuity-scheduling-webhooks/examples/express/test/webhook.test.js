const request = require('supertest');
const crypto = require('crypto');

// Set before requiring the app (the key is read at module load)
process.env.ACUITY_API_KEY = 'test_acuity_api_key';
const app = require('../src/index');
const { verifyAcuitySignature } = require('../src/index');

const apiKey = 'test_acuity_api_key';

// Acuity: base64 HMAC-SHA256 of the raw body, keyed with the account API key
function sign(body, key = apiKey) {
  return crypto.createHmac('sha256', key).update(body).digest('base64');
}

const body = 'action=scheduled&id=13&calendarID=1&appointmentTypeID=13';

describe('Acuity Scheduling webhook endpoint', () => {
  let logSpy;
  let errSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('returns 400 when the signature header is missing', async () => {
    const res = await request(app)
      .post('/webhooks/acuity-scheduling')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(body);
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await request(app)
      .post('/webhooks/acuity-scheduling')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('X-Acuity-Signature', 'invalid')
      .send(body);
    expect(res.status).toBe(400);
  });

  it('returns 400 when signed with the wrong key', async () => {
    const res = await request(app)
      .post('/webhooks/acuity-scheduling')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('X-Acuity-Signature', sign(body, 'other_key'))
      .send(body);
    expect(res.status).toBe(400);
  });

  it('returns 400 when the body is tampered with', async () => {
    const res = await request(app)
      .post('/webhooks/acuity-scheduling')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('X-Acuity-Signature', sign(body))
      .send(body.replace('id=13', 'id=14'));
    expect(res.status).toBe(400);
  });

  it.each(['scheduled', 'rescheduled', 'canceled', 'changed', 'order.completed'])(
    'accepts a validly signed %s action',
    async (action) => {
      const payload = `action=${action}&id=13&calendarID=1&appointmentTypeID=13`;
      const res = await request(app)
        .post('/webhooks/acuity-scheduling')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .set('X-Acuity-Signature', sign(payload))
        .send(payload);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    }
  );

  it('verifies regardless of content type', async () => {
    const res = await request(app)
      .post('/webhooks/acuity-scheduling')
      .set('Content-Type', 'text/plain')
      .set('X-Acuity-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('acknowledges unknown actions', async () => {
    const payload = 'action=something.else&id=1';
    const res = await request(app)
      .post('/webhooks/acuity-scheduling')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('X-Acuity-Signature', sign(payload))
      .send(payload);
    expect(res.status).toBe(200);
  });

  it('exposes a health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});

describe('verifyAcuitySignature', () => {
  it('accepts a valid signature for string and Buffer bodies', () => {
    expect(verifyAcuitySignature(body, sign(body), apiKey)).toBe(true);
    expect(verifyAcuitySignature(Buffer.from(body), sign(body), apiKey)).toBe(true);
  });

  it('rejects missing or mismatched-length signatures without throwing', () => {
    expect(verifyAcuitySignature(body, undefined, apiKey)).toBe(false);
    expect(verifyAcuitySignature(body, 'short', apiKey)).toBe(false);
  });
});
