// Generated with: bitgo-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Synthetic secret
const SECRET = 'bitgo_synthetic_webhook_secret_5e2d';
process.env.BITGO_WEBHOOK_SECRET = SECRET;

const { app, verifyBitGoSignature } = require('../src/index');

const BODY = '{"type":"transfer","wallet":"62c5b5c9d0ece30007cec9616ff29edc","coin":"tbtc4","transfer":"68531ea4e3669330070c95e454f5b366","hash":"db924f4cf2347ac5a6b464d3e8dc4a20cffc117eb29f4460645fbc34de171bfb","state":"confirmed","simulation":true}';
const BODY2 = '{"type":"pendingapproval","wallet":"62c5b5c9d0ece30007cec9616ff29edc","coin":"tbtc4","pendingApprovalId":"6853262b9da229cea98569ce","state":"pending","simulation":true}';

const sign = (body, key = SECRET) => '' + crypto.createHmac('sha256', key).update(body).digest('hex');

const post = (body, signature, headers = {}) => {
  const req = request(app).post('/webhooks/bitgo').set('Content-Type', 'application/json').set(headers);
  if (signature !== undefined) req.set('X-Signature-SHA256', signature);
  return req.send(body);
};

beforeEach(() => {
  process.env.BITGO_WEBHOOK_SECRET = SECRET;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('verifyBitGoSignature', () => {
  it('accepts a signature over the raw body', () => {
    expect(verifyBitGoSignature(BODY, sign(BODY), SECRET)).toBe(true);
  });

  it('rejects a base64 digest: BitGo sends hex', () => {
    const other = '' + crypto.createHmac('sha256', SECRET).update(BODY).digest('base64');
    expect(verifyBitGoSignature(BODY, other, SECRET)).toBe(false);
  });

});

describe('/webhooks/bitgo', () => {

  it('accepts a valid signature', async () => {
    const res = await post(BODY, sign(BODY));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, type: 'transfer', wallet: '62c5b5c9d0ece30007cec9616ff29edc' });
  });

  it('handles a second event type', async () => {
    const res = await post(BODY2, sign(BODY2));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('pendingapproval');
  });

  it('rejects a signature made with another secret', async () => {
    expect((await post(BODY, sign(BODY, 'wrong_secret'))).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    expect((await post(BODY.replace('"state":"confirmed"', '"state":"failed"'), sign(BODY))).status).toBe(401);
  });

  it('rejects a missing signature header', async () => {
    expect((await post(BODY)).status).toBe(401);
  });

  it('accepts a secret with a trailing newline', async () => {
    process.env.BITGO_WEBHOOK_SECRET = `${SECRET}\n`;
    expect((await post(BODY, sign(BODY))).status).toBe(200);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"truncated": ';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('returns 500 when BITGO_WEBHOOK_SECRET is not set', async () => {
    delete process.env.BITGO_WEBHOOK_SECRET;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });
});
