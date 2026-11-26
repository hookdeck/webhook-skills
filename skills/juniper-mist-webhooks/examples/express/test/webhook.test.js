// Generated with: juniper-mist-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Synthetic secret
const SECRET = 'mist_synthetic_webhook_secret_4b1e';
process.env.MIST_WEBHOOK_SECRET = SECRET;

const { app, verifyMistSignature } = require('../src/index');

const BODY = '{"topic":"audits","events":[{"admin_name":"Synthetic Admin","id":"5f1e2d3c-0000-4000-8000-000000000001","message":"Update Site Settings","org_id":"9a1b2c3d-0000-4000-8000-000000000001","site_id":"7e6d5c4b-0000-4000-8000-000000000001","src_ip":"192.0.2.10","timestamp":1763460900.123}]}';
const BODY2 = '{"topic":"device-events","events":[{"device_name":"AP-Lobby","device_type":"ap","mac":"5c5b35000001","org_id":"9a1b2c3d-0000-4000-8000-000000000001","site_id":"7e6d5c4b-0000-4000-8000-000000000001","site_name":"HQ","timestamp":1763461200,"type":"AP_RESTARTED"},{"device_name":"AP-Lobby","device_type":"ap","mac":"5c5b35000001","org_id":"9a1b2c3d-0000-4000-8000-000000000001","site_id":"7e6d5c4b-0000-4000-8000-000000000001","site_name":"HQ","timestamp":1763461260,"type":"AP_CONFIGURED"}]}';

const sign = (body, key = SECRET) => '' + crypto.createHmac('sha256', key).update(body).digest('hex');

const post = (body, signature, headers = {}) => {
  const req = request(app).post('/webhooks/juniper-mist').set('Content-Type', 'application/json').set(headers);
  if (signature !== undefined) req.set('X-Mist-Signature-v2', signature);
  return req.send(body);
};

beforeEach(() => {
  process.env.MIST_WEBHOOK_SECRET = SECRET;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('verifyMistSignature', () => {
  it('accepts a signature over the raw body', () => {
    expect(verifyMistSignature(BODY, sign(BODY), SECRET)).toBe(true);
  });

  it('rejects a base64 digest: Juniper Mist sends hex', () => {
    const other = '' + crypto.createHmac('sha256', SECRET).update(BODY).digest('base64');
    expect(verifyMistSignature(BODY, other, SECRET)).toBe(false);
  });

  it('accepts uppercase hex', () => {
    expect(verifyMistSignature(BODY, sign(BODY).toUpperCase(), SECRET)).toBe(true);
  });

  it('rejects the v1 HMAC-SHA1 value in place of v2', () => {
    expect(verifyMistSignature(BODY, crypto.createHmac('sha1', SECRET).update(BODY).digest('hex'), SECRET)).toBe(false);
  });
});

describe('/webhooks/juniper-mist', () => {

  it('accepts a valid signature', async () => {
    const res = await post(BODY, sign(BODY));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, topic: 'audits', events: 1 });
  });

  it('handles a second event type', async () => {
    const res = await post(BODY2, sign(BODY2));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, topic: 'device-events', events: 2 });
  });

  it('rejects a signature made with another secret', async () => {
    expect((await post(BODY, sign(BODY, 'wrong_secret'))).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    expect((await post(BODY.replace('"Update Site Settings"', '"Delete Site"'), sign(BODY))).status).toBe(401);
  });

  it('rejects a missing signature header', async () => {
    expect((await post(BODY)).status).toBe(401);
  });

  it('rejects a request with only the v1 X-Mist-Signature header', async () => {
    expect((await post(BODY, undefined, { 'X-Mist-Signature': crypto.createHmac('sha1', SECRET).update(BODY).digest('hex') })).status).toBe(401);
  });

  it('accepts a valid v2 header sent alongside v1', async () => {
    expect((await post(BODY, sign(BODY), { 'X-Mist-Signature': crypto.createHmac('sha1', SECRET).update(BODY).digest('hex') })).status).toBe(200);
  });
  it('accepts a secret with a trailing newline', async () => {
    process.env.MIST_WEBHOOK_SECRET = `${SECRET}\n`;
    expect((await post(BODY, sign(BODY))).status).toBe(200);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"truncated": ';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('returns 500 when MIST_WEBHOOK_SECRET is not set', async () => {
    delete process.env.MIST_WEBHOOK_SECRET;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });
});
