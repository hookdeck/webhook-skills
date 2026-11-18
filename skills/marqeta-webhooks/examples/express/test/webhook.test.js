// Generated with: marqeta-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Synthetic credentials
const USERNAME = 'marqeta_webhook';
const PASSWORD = 'Synthetic_Pass-2026:abcXYZ!';
const SECRET = 'Synthetic_Secret-2026_abcXYZ#';
process.env.MARQETA_WEBHOOK_USERNAME = USERNAME;
process.env.MARQETA_WEBHOOK_PASSWORD = PASSWORD;

const { app, verifyBasicAuth, verifyMarqetaSignature, parseAlgorithms } = require('../src/index');

const TXNS = '{"transactions":[{"type":"authorization","state":"PENDING","token":"synthetic-txn-0001","user_token":"synthetic-user-01","card_token":"synthetic-card-01","amount":10.00,"currency_code":"USD","created_time":"2026-11-18T10:15:00Z"},{"type":"authorization.clearing","state":"COMPLETION","token":"synthetic-txn-0002","user_token":"synthetic-user-01","card_token":"synthetic-card-01","amount":10.00,"currency_code":"USD","created_time":"2026-11-18T10:16:00Z"}]}';
const CARD = '{"cards":[{"token":"synthetic-cardtransition-01","card_token":"synthetic-card-01","user_token":"synthetic-user-01","state":"ACTIVE","type":"state.activated","channel":"API","created_time":"2026-11-18T10:17:00Z"}]}';
const PING = '{"pings":[{"token":"marqeta","payload":"healthcheck"}]}';

const basic = (username = USERNAME, password = PASSWORD) =>
  `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
const sign = (body, algorithm = 'sha256', key = SECRET) => crypto.createHmac(algorithm, key).update(body).digest('hex');

const post = (body, authorization, signature) => {
  const req = request(app).post('/webhooks/marqeta').set('Content-Type', 'application/json');
  if (authorization !== undefined) req.set('Authorization', authorization);
  if (signature !== undefined) req.set('X-Marqeta-Signature', signature);
  return req.send(body);
};

beforeEach(() => {
  process.env.MARQETA_WEBHOOK_USERNAME = USERNAME;
  process.env.MARQETA_WEBHOOK_PASSWORD = PASSWORD;
  delete process.env.MARQETA_WEBHOOK_SECRET;
  delete process.env.MARQETA_SIGNATURE_ALGORITHM;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('verifyBasicAuth', () => {
  it('accepts the credentials, with a colon in the password', () => {
    expect(verifyBasicAuth(basic(), USERNAME, PASSWORD)).toBe(true);
    expect(verifyBasicAuth(basic().replace('Basic', 'basic'), USERNAME, PASSWORD)).toBe(true);
  });

  it('rejects other schemes and malformed credentials', () => {
    expect(verifyBasicAuth(`Bearer ${PASSWORD}`, USERNAME, PASSWORD)).toBe(false);
    expect(verifyBasicAuth(`Basic ${Buffer.from('no-colon').toString('base64')}`, USERNAME, PASSWORD)).toBe(false);
    expect(verifyBasicAuth('Basic !!!', USERNAME, PASSWORD)).toBe(false);
  });
});

describe('verifyMarqetaSignature', () => {
  it('accepts lowercase hex HMAC-SHA256 of the raw body', () => {
    expect(verifyMarqetaSignature(TXNS, sign(TXNS), SECRET)).toBe(true);
  });

  it('accepts HMAC-SHA1 only when sha1 is configured', () => {
    expect(verifyMarqetaSignature(TXNS, sign(TXNS, 'sha1'), SECRET, ['sha1'])).toBe(true);
    expect(verifyMarqetaSignature(TXNS, sign(TXNS, 'sha1'), SECRET, ['sha256'])).toBe(false);
    expect(verifyMarqetaSignature(TXNS, sign(TXNS, 'sha1'), SECRET, parseAlgorithms('sha256,sha1'))).toBe(true);
  });

  it('rejects base64, another secret and a changed body', () => {
    const b64 = crypto.createHmac('sha256', SECRET).update(TXNS).digest('base64');
    expect(verifyMarqetaSignature(TXNS, b64, SECRET)).toBe(false);
    expect(verifyMarqetaSignature(TXNS, sign(TXNS, 'sha256', 'Another_Secret-2026_xyz'), SECRET)).toBe(false);
    expect(verifyMarqetaSignature(TXNS.replace('10.00', '1000.00'), sign(TXNS), SECRET)).toBe(false);
  });
});

describe('POST /webhooks/marqeta', () => {
  it('accepts valid credentials and counts the batched notifications', async () => {
    const res = await post(TXNS, basic());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, counts: { transactions: 2 } });
  });

  it('handles other notification types', async () => {
    const res = await post(CARD, basic());
    expect(res.body.counts).toEqual({ cards: 1 });
  });

  it('answers the health-check ping', async () => {
    const res = await post(PING, basic());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, ping: true });
  });

  it('rejects a wrong password, a wrong username and a missing header', async () => {
    expect((await post(TXNS, basic(USERNAME, 'Wrong_Pass-2026_abcXYZ!'))).status).toBe(401);
    expect((await post(TXNS, basic('someone-else', PASSWORD))).status).toBe(401);
    expect((await post(TXNS)).status).toBe(401);
  });

  it('checks X-Marqeta-Signature when MARQETA_WEBHOOK_SECRET is set', async () => {
    process.env.MARQETA_WEBHOOK_SECRET = SECRET;
    expect((await post(TXNS, basic(), sign(TXNS))).status).toBe(200);
    expect((await post(TXNS, basic())).status).toBe(401);
    expect((await post(TXNS.replace('10.00', '1000.00'), basic(), sign(TXNS))).status).toBe(401);
  });

  it('still requires Basic auth when the signature is valid', async () => {
    process.env.MARQETA_WEBHOOK_SECRET = SECRET;
    expect((await post(TXNS, undefined, sign(TXNS))).status).toBe(401);
  });

  it('accepts legacy HMAC-SHA1 during a switch to sha256', async () => {
    process.env.MARQETA_WEBHOOK_SECRET = SECRET;
    process.env.MARQETA_SIGNATURE_ALGORITHM = 'sha256,sha1';
    expect((await post(TXNS, basic(), sign(TXNS, 'sha1'))).status).toBe(200);
  });

  it('returns 400 for invalid JSON with valid credentials', async () => {
    expect((await post('{"truncated": ', basic())).status).toBe(400);
  });

  it('returns 500 when the credentials are not set', async () => {
    delete process.env.MARQETA_WEBHOOK_PASSWORD;
    expect((await post(TXNS, basic())).status).toBe(500);
  });
});
