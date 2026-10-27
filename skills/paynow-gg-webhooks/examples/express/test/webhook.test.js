const crypto = require('crypto');
const request = require('supertest');

const SECRET = 'paynow_test_signing_secret';
process.env.PAYNOW_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

// Same algorithm as PayNow: base64(HMAC-SHA256(secret, `${timestamp}.${body}`))
function sign(body, timestamp = String(Date.now()), secret = SECRET) {
  const message = Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from('.'), Buffer.from(body)]);
  return {
    'PayNow-Timestamp': timestamp,
    'PayNow-Signature': crypto.createHmac('sha256', secret).update(message).digest('base64'),
  };
}

const post = (body, headers = {}, contentType = 'application/json') =>
  request(app).post('/webhooks/paynow-gg').set('Content-Type', contentType).set(headers).send(body);

const event = (event_type, body = { id: '411486491630370816' }) =>
  JSON.stringify({ event_id: '411486491630370817', event_type, body });

describe('PayNow webhook', () => {
  afterEach(() => {
    delete process.env.PAYNOW_WEBHOOK_TOLERANCE_SECONDS;
  });

  it.each(['ON_ORDER_COMPLETED', 'ON_PAYMENT_COMPLETED', 'ON_REFUND', 'ON_SUBSCRIPTION_RENEWED'])(
    'accepts a validly signed %s',
    async (type) => {
      const body = event(type);
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    }
  );

  it('accepts unknown event types', async () => {
    const body = event('ON_SOMETHING_NEW');
    expect((await post(body, sign(body))).status).toBe(200);
  });

  it('verifies the exact bytes for any content type', async () => {
    const body = event('ON_ORDER_COMPLETED', { id: '1', billing_name: 'José' });
    expect((await post(body, sign(body), 'text/plain')).status).toBe(200);
  });

  it('rejects a body that does not parse as JSON, after verifying it', async () => {
    const bad = Buffer.from([0xff, 0xfe, 0x7b]);
    const message = Buffer.concat([Buffer.from('1700000000000'), Buffer.from('.'), bad]);
    const sig = crypto.createHmac('sha256', SECRET).update(message).digest('base64');
    const res = await post(bad, { 'PayNow-Timestamp': '1700000000000', 'PayNow-Signature': sig }, 'application/octet-stream');
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = event('ON_ORDER_COMPLETED');
    const res = await post(body.replace('411486491630370816', '1'), sign(body));
    expect(res.status).toBe(401);
  });

  it('rejects a wrong secret', async () => {
    const body = event('ON_ORDER_COMPLETED');
    expect((await post(body, sign(body, undefined, 'other_secret'))).status).toBe(401);
  });

  it('rejects a timestamp that was not the one signed', async () => {
    const body = event('ON_ORDER_COMPLETED');
    const headers = { ...sign(body, '1700000000000'), 'PayNow-Timestamp': '1700000000001' };
    expect((await post(body, headers)).status).toBe(401);
  });

  it('rejects a missing signature header', async () => {
    const body = event('ON_ORDER_COMPLETED');
    expect((await post(body, { 'PayNow-Timestamp': String(Date.now()) })).status).toBe(401);
  });

  it('rejects a missing timestamp header', async () => {
    const body = event('ON_ORDER_COMPLETED');
    expect((await post(body, { 'PayNow-Signature': sign(body)['PayNow-Signature'] })).status).toBe(401);
  });

  it('rejects an empty body without headers', async () => {
    expect((await request(app).post('/webhooks/paynow-gg')).status).toBe(401);
  });

  it.each([
    ['too short', 'abc='],
    ['hex digest', crypto.randomBytes(32).toString('hex').slice(0, 44)],
    ['url-safe alphabet', 'A'.repeat(42) + '-='],
    ['unpadded', 'A'.repeat(44)],
  ])('rejects a malformed signature (%s)', async (_name, sig) => {
    const body = event('ON_ORDER_COMPLETED');
    const headers = { ...sign(body), 'PayNow-Signature': sig };
    expect((await post(body, headers)).status).toBe(401);
  });

  it('rejects a signature with different base64 case', async () => {
    const body = event('ON_ORDER_COMPLETED');
    const headers = sign(body);
    headers['PayNow-Signature'] = headers['PayNow-Signature'].toLowerCase();
    expect((await post(body, headers)).status).toBe(401);
  });

  it('rejects a non-canonical base64 encoding of the right digest', async () => {
    const body = event('ON_ORDER_COMPLETED');
    const headers = sign(body);
    const sig = headers['PayNow-Signature'];
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    // Set a stray low bit in the last character: decodes to the same bytes, but is not what PayNow sends
    headers['PayNow-Signature'] = sig.slice(0, 42) + A[A.indexOf(sig[42]) | 1] + '=';
    expect((await post(body, headers)).status).toBe(401);
  });

  describe('optional timestamp tolerance', () => {
    const old = String(Date.now() - 60 * 60 * 1000);

    it('does not reject old timestamps by default', async () => {
      const body = event('ON_ORDER_COMPLETED');
      expect((await post(body, sign(body, old))).status).toBe(200);
    });

    it('rejects old timestamps when PAYNOW_WEBHOOK_TOLERANCE_SECONDS is set', async () => {
      process.env.PAYNOW_WEBHOOK_TOLERANCE_SECONDS = '300';
      const body = event('ON_ORDER_COMPLETED');
      expect((await post(body, sign(body, old))).status).toBe(401);
    });

    it('accepts fresh timestamps when tolerance is set', async () => {
      process.env.PAYNOW_WEBHOOK_TOLERANCE_SECONDS = '300';
      const body = event('ON_ORDER_COMPLETED');
      expect((await post(body, sign(body))).status).toBe(200);
    });
  });
});
