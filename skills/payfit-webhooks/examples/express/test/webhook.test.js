// Generated with: payfit-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

const SECRET = 'whsec_D0GCbp+5KpS3D+Br/8bijPSMm7LkLj1m'; // synthetic
process.env.PAYFIT_WEBHOOK_SECRET = SECRET;

const { app, verifyPayfitWebhook } = require('../src/index');

const BODY = '{"type":"payroll.run","data":{"companyId":"602e441f3e724b4d74a9cc87","effectiveDate":"2026-11-18T13:02:33+00:00","payrollMonth":"202611"}}';
const ACTIVATED = '{"type":"integration.activated","data":{"companyId":"602e441f3e724b4d74a9cc87","effectiveDate":"2026-11-18T09:20:39+00:00"}}';
const KEY = Buffer.from(SECRET.slice('whsec_'.length), 'base64');

const sign = (body, { key = KEY, id = 'msg_2pT9xY4bW8cN1qR3', timestamp = String(Math.floor(Date.now() / 1000)) } = {}) => ({
  'svix-id': id,
  'svix-timestamp': timestamp,
  'svix-signature': `v1,${crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')}`,
});

const post = (body, headers = {}) => {
  const req = request(app).post('/webhooks/payfit').set('Content-Type', 'application/json');
  for (const [name, value] of Object.entries(headers)) req.set(name, value);
  return req.send(body);
};

beforeEach(() => {
  process.env.PAYFIT_WEBHOOK_SECRET = SECRET;
  delete process.env.PAYFIT_WEBHOOK_TOLERANCE_SECONDS;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('verifyPayfitWebhook', () => {
  it("matches the example in Svix's manual verification guide", () => {
    const headers = {
      'svix-id': 'msg_loFOjxBNrRLzqYUf',
      'svix-timestamp': '1731705121',
      'svix-signature': 'v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=',
    };
    const payload = '{"event_type":"ping","data":{"success":true}}';
    expect(verifyPayfitWebhook(payload, headers, 'whsec_plJ3nmyCDGBKInavdOK15jsl')).toBe(true);
  });

  it('accepts any matching v1 entry during a secret rotation', () => {
    const headers = sign(BODY);
    headers['svix-signature'] = `v1,${crypto.randomBytes(32).toString('base64')} ${headers['svix-signature']}`;
    expect(verifyPayfitWebhook(BODY, headers, SECRET)).toBe(true);
  });

  it('applies the timestamp window only when one is set', () => {
    const old = sign(BODY, { timestamp: String(Math.floor(Date.now() / 1000) - 3600) });
    expect(verifyPayfitWebhook(BODY, old, SECRET)).toBe(true);
    expect(verifyPayfitWebhook(BODY, old, SECRET, 300)).toBe(false);
  });
});

describe('POST /webhooks/payfit', () => {
  it('accepts a valid signature', async () => {
    const res = await post(BODY, sign(BODY));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, type: 'payroll.run', company_id: '602e441f3e724b4d74a9cc87' });
  });

  it('handles integration events', async () => {
    const res = await post(ACTIVATED, sign(ACTIVATED));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('integration.activated');
  });

  it('rejects a signature keyed with the secret as UTF-8 text instead of its decoded bytes', async () => {
    expect((await post(BODY, sign(BODY, { key: Buffer.from(SECRET, 'utf8') }))).status).toBe(401);
  });

  it('accepts the secret without the whsec_ prefix', async () => {
    process.env.PAYFIT_WEBHOOK_SECRET = SECRET.slice('whsec_'.length);
    expect((await post(BODY, sign(BODY))).status).toBe(200);
  });

  it('rejects another secret and a tampered body', async () => {
    expect((await post(BODY, sign(BODY, { key: crypto.randomBytes(24) }))).status).toBe(401);
    expect((await post(BODY.replace('202611', '202612'), sign(BODY))).status).toBe(401);
  });

  it('rejects a request missing any svix header', async () => {
    for (const name of ['svix-id', 'svix-timestamp', 'svix-signature']) {
      const headers = sign(BODY);
      delete headers[name];
      expect((await post(BODY, headers)).status).toBe(401);
    }
  });

  it('rejects an old timestamp when PAYFIT_WEBHOOK_TOLERANCE_SECONDS is set', async () => {
    process.env.PAYFIT_WEBHOOK_TOLERANCE_SECONDS = '300';
    const old = sign(BODY, { timestamp: String(Math.floor(Date.now() / 1000) - 3600) });
    expect((await post(BODY, old)).status).toBe(401);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"truncated": ';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('returns 500 when the secret is missing or not valid base64', async () => {
    delete process.env.PAYFIT_WEBHOOK_SECRET;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
    process.env.PAYFIT_WEBHOOK_SECRET = 'whsec_not*base64!';
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });
});
