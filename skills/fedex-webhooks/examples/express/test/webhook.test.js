// Generated with: fedex-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Synthetic secret
const SECRET = 'SyntheticFedexToken2026abcdXYZ';
process.env.FEDEX_WEBHOOK_SECURITY_TOKEN = SECRET;

const { app, verifyFedExSignature } = require('../src/index');

const BODY = '{"trackingNumber":"794600000001","eventType":"IT","eventDescription":"In transit","synthetic":true}';
const BODY2 = '{"trackingNumber":"794600000002","eventType":"DL","eventDescription":"Delivered","synthetic":true}';

const sign = (body, key = SECRET) => '' + crypto.createHmac('sha256', key).update(body).digest('base64');

const post = (body, signature, headers = {}) => {
  const req = request(app).post('/webhooks/fedex').set('Content-Type', 'application/json').set(headers);
  if (signature !== undefined) req.set('fdx-signature', signature);
  return req.send(body);
};

beforeEach(() => {
  process.env.FEDEX_WEBHOOK_SECURITY_TOKEN = SECRET;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('verifyFedExSignature', () => {
  it('accepts a signature over the raw body', () => {
    expect(verifyFedExSignature(BODY, sign(BODY), SECRET)).toBe(true);
  });

  it('rejects a hex digest: FedEx sends base64', () => {
    const other = '' + crypto.createHmac('sha256', SECRET).update(BODY).digest('hex');
    expect(verifyFedExSignature(BODY, other, SECRET)).toBe(false);
  });

});

describe('/webhooks/fedex', () => {

  it('accepts a valid signature', async () => {
    const res = await post(BODY, sign(BODY));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('handles a second event type', async () => {
    const res = await post(BODY2, sign(BODY2));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('rejects a signature made with another secret', async () => {
    expect((await post(BODY, sign(BODY, 'wrong_secret'))).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    expect((await post(BODY.replace('"eventType":"IT"', '"eventType":"DL"'), sign(BODY))).status).toBe(401);
  });

  it('rejects a missing signature header', async () => {
    expect((await post(BODY)).status).toBe(401);
  });

  it('accepts a secret with a trailing newline', async () => {
    process.env.FEDEX_WEBHOOK_SECURITY_TOKEN = `${SECRET}\n`;
    expect((await post(BODY, sign(BODY))).status).toBe(200);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"truncated": ';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('returns 500 when FEDEX_WEBHOOK_SECURITY_TOKEN is not set', async () => {
    delete process.env.FEDEX_WEBHOOK_SECURITY_TOKEN;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });
});
