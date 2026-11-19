// Generated with: employment-hero-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Synthetic secret key (base64 of 32 bytes), shaped like the one the Developer Portal shows.
const SECRET = 's3y0VT/1knFo5q9JnXJCjQHyPt8GfhmYkcS8lNF3D/Q=';
const KEY = Buffer.from(SECRET, 'base64');
const OTHER_KEY = crypto.createHash('sha256').update('another-employment-hero-webhook').digest();
const BAD_SECRET = 'not base64!';
const SIGNATURE_HEADER = 'x-employmenthero-signature';
const TIMESTAMP = '1731924900';

// Check vector: synthetic secret, fixed body and timestamp (Employment Hero publishes none).
const VECTOR_BODY = '{"id":"evt_1","type":"test","data":{"a":1}}';
const VECTOR_TIMESTAMP = '1700000000';
const VECTOR_SIGNATURE = 'y/dPUVP8svSzwTMHHftIu7AnRoLSZxFwdD8iK1MWLEY=';

// Made-up body: Employment Hero doesn't publish a payload sample. Pretty-printed so a
// re-serialised body would not match.
const BODY = JSON.stringify({ id: 'evt_test_1', type: 'test', data: { note: 'illustrative' } }, null, 2);
const TAMPER_FROM = 'illustrative';
const TAMPER_TO = 'tampered';
process.env.EMPLOYMENT_HERO_WEBHOOK_SECRET = SECRET;

const { app, verifyEmploymentHeroWebhook } = require('../src/index');

/** Sign like Employment Hero: base64 HMAC-SHA256 of "<timestamp>.<body>", keyed with the decoded secret. */
function sign(body, { key = KEY, timestamp = TIMESTAMP } = {}) {
  const digest = crypto.createHmac('sha256', key).update(`${timestamp}.`).update(body).digest('base64');
  return { 'x-employmenthero-signature': digest, 'x-employmenthero-timestamp': timestamp };
}

const post = (body, headers = {}, contentType = 'application/json') => {
  const req = request(app).post('/webhooks/employment-hero').set('Content-Type', contentType);
  for (const [name, value] of Object.entries(headers)) req.set(name, value);
  return req.send(body);
};

/** Drop one header from a signed set. */
const without = (headers, name) => Object.fromEntries(Object.entries(headers).filter(([key]) => key !== name));

beforeEach(() => {
  process.env.EMPLOYMENT_HERO_WEBHOOK_SECRET = SECRET;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('verifyEmploymentHeroWebhook', () => {
  it('matches the check vector', () => {
    expect(verifyEmploymentHeroWebhook(VECTOR_BODY, VECTOR_SIGNATURE, VECTOR_TIMESTAMP, SECRET)).toBe(true);
    expect(verifyEmploymentHeroWebhook(Buffer.from(VECTOR_BODY), VECTOR_SIGNATURE, VECTOR_TIMESTAMP, SECRET)).toBe(true);
  });

  it('rejects the vector with another timestamp or a malformed secret', () => {
    expect(verifyEmploymentHeroWebhook(VECTOR_BODY, VECTOR_SIGNATURE, '1700000001', SECRET)).toBe(false);
    expect(verifyEmploymentHeroWebhook(VECTOR_BODY, VECTOR_SIGNATURE, VECTOR_TIMESTAMP, BAD_SECRET)).toBe(false);
  });
});

describe('POST /webhooks/employment-hero', () => {
  it('accepts a valid signature', async () => {
    const res = await post(BODY, sign(BODY));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('rejects a signature keyed with the secret as UTF-8 text instead of its decoded bytes', async () => {
    const res = await post(BODY, sign(BODY, { key: Buffer.from(SECRET, 'utf8') }));
    expect(res.status).toBe(401);
  });

  it('rejects a signature made with another secret', async () => {
    expect((await post(BODY, sign(BODY, { key: OTHER_KEY }))).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    expect((await post(BODY.replace(TAMPER_FROM, TAMPER_TO), sign(BODY))).status).toBe(401);
  });

  it('rejects a missing signature header', async () => {
    expect((await post(BODY, without(sign(BODY), SIGNATURE_HEADER))).status).toBe(401);
  });

  it('accepts a secret with a trailing newline', async () => {
    process.env.EMPLOYMENT_HERO_WEBHOOK_SECRET = `${SECRET}\n`;
    expect((await post(BODY, sign(BODY))).status).toBe(200);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"truncated": ';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('returns 500 when EMPLOYMENT_HERO_WEBHOOK_SECRET is not set', async () => {
    delete process.env.EMPLOYMENT_HERO_WEBHOOK_SECRET;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });

  it('returns 500 when the secret is not valid base64', async () => {
    process.env.EMPLOYMENT_HERO_WEBHOOK_SECRET = BAD_SECRET;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });

  it('rejects a changed or missing timestamp', async () => {
    expect((await post(BODY, { ...sign(BODY), 'x-employmenthero-timestamp': '1731924901' })).status).toBe(401);
    expect((await post(BODY, without(sign(BODY), 'x-employmenthero-timestamp'))).status).toBe(401);
  });

  it('rejects a hex digest in place of base64', async () => {
    const hex = crypto.createHmac('sha256', KEY).update(`${TIMESTAMP}.`).update(BODY).digest('hex');
    expect((await post(BODY, { ...sign(BODY), [SIGNATURE_HEADER]: hex })).status).toBe(401);
  });
});
