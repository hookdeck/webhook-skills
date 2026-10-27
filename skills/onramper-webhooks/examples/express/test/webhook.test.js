const request = require('supertest');
const crypto = require('crypto');

// Onramper issues an arbitrary secret string; it is used as-is as UTF-8 bytes.
const SECRET = 'test_onramper_webhook_secret';
process.env.ONRAMPER_WEBHOOK_SECRET = SECRET;

const app = require('../src/index');
const { verifyOnramperSignature } = require('../src/index');

// Payload from Onramper's documented sample
const pending = {
  apiKey: 'pk_test_01K4MF4ZBPGDCV3GFFNA684NT0',
  country: 'us',
  inAmount: 100,
  onramp: 'gatefi',
  onrampTransactionId: '8bf94c80-test-aabb-851-143835984d1d',
  outAmount: 3.83527521,
  paymentMethod: 'creditcard',
  partnerContext: '',
  sourceCurrency: 'usd',
  status: 'pending',
  statusDate: '2023-08-09T13:15:18.725Z',
  targetCurrency: 'sol',
  transactionId: '01H7D547TESTV2RQJ52ZAB7WF7',
  transactionType: 'buy',
  transactionHash: '',
  walletAddress: 'testG15oy66q7cU6aNige54PxLLEfGZvRsAADjbF7D4',
};

function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function post(body, headers = {}) {
  return request(app)
    .post('/webhooks/onramper')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(body);
}

describe('POST /webhooks/onramper', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  describe('signature verification', () => {
    it('accepts a valid signature', async () => {
      const body = JSON.stringify(pending);
      const res = await post(body, { 'X-Onramper-Webhook-Signature': sign(body) });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('accepts an uppercase hex signature', async () => {
      const body = JSON.stringify(pending);
      const res = await post(body, { 'X-Onramper-Webhook-Signature': sign(body).toUpperCase() });
      expect(res.status).toBe(200);
    });

    it('verifies the exact bytes, not re-serialized JSON', async () => {
      const body = JSON.stringify(pending, null, 2);
      const res = await post(body, { 'X-Onramper-Webhook-Signature': sign(body) });
      expect(res.status).toBe(200);
    });

    it('accepts any content type', async () => {
      const body = JSON.stringify(pending);
      const res = await request(app)
        .post('/webhooks/onramper')
        .set('Content-Type', 'text/plain')
        .set('X-Onramper-Webhook-Signature', sign(body))
        .send(body);
      expect(res.status).toBe(200);
    });

    it('rejects a missing signature', async () => {
      const res = await post(JSON.stringify(pending));
      expect(res.status).toBe(401);
    });

    it('rejects an empty signature', async () => {
      const res = await post(JSON.stringify(pending), { 'X-Onramper-Webhook-Signature': '' });
      expect(res.status).toBe(401);
    });

    it('rejects a signature signed with the wrong secret', async () => {
      const body = JSON.stringify(pending);
      const res = await post(body, { 'X-Onramper-Webhook-Signature': sign(body, 'other_secret') });
      expect(res.status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      const body = JSON.stringify(pending);
      const res = await post(body.replace('"inAmount":100', '"inAmount":1'), {
        'X-Onramper-Webhook-Signature': sign(body),
      });
      expect(res.status).toBe(401);
    });

    it('rejects malformed signatures without throwing', async () => {
      const body = JSON.stringify(pending);
      const good = sign(body);
      for (const bad of [
        good.slice(0, 62), // too short
        `${good}00`, // too long
        `${good.slice(0, 63)}z`, // not hex
        `sha256=${good}`, // prefixed
        'g'.repeat(64), // right length, not hex
      ]) {
        const res = await post(body, { 'X-Onramper-Webhook-Signature': bad });
        expect(res.status).toBe(401);
      }
    });

    it('rejects everything when the secret is not configured', async () => {
      const body = JSON.stringify(pending);
      const saved = process.env.ONRAMPER_WEBHOOK_SECRET;
      delete process.env.ONRAMPER_WEBHOOK_SECRET;
      const res = await post(body, { 'X-Onramper-Webhook-Signature': sign(body) });
      process.env.ONRAMPER_WEBHOOK_SECRET = saved;
      expect(res.status).toBe(401);
    });
  });

  describe('status events', () => {
    for (const status of ['completed', 'paid', 'pending', 'new', 'failed', 'canceled']) {
      it(`handles status ${status}`, async () => {
        const body = JSON.stringify({ ...pending, status });
        const res = await post(body, { 'X-Onramper-Webhook-Signature': sign(body) });
        expect(res.status).toBe(200);
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining(pending.transactionId));
      });
    }

    it('handles an offramp transaction', async () => {
      const body = JSON.stringify({ ...pending, status: 'completed', transactionType: 'offramp' });
      const res = await post(body, { 'X-Onramper-Webhook-Signature': sign(body) });
      expect(res.status).toBe(200);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('(offramp)'));
    });

    it('logs and accepts an unknown status', async () => {
      const body = JSON.stringify({ ...pending, status: 'something_else' });
      const res = await post(body, { 'X-Onramper-Webhook-Signature': sign(body) });
      expect(res.status).toBe(200);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Unhandled status'));
    });
  });

  it('returns 400 for a signed but invalid JSON body', async () => {
    const body = 'not json';
    const res = await post(body, { 'X-Onramper-Webhook-Signature': sign(body) });
    expect(res.status).toBe(400);
  });
});

describe('verifyOnramperSignature', () => {
  it('works on a Buffer body', () => {
    const body = Buffer.from('{"status":"new"}');
    expect(verifyOnramperSignature(body, sign(body), SECRET)).toBe(true);
    expect(verifyOnramperSignature(body, sign(body), 'nope')).toBe(false);
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
