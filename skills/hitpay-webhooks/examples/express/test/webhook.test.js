const crypto = require('crypto');
const request = require('supertest');

// Set test environment variables before importing the app
process.env.HITPAY_WEBHOOK_SALT = 'test_hitpay_webhook_salt_0123456789';

const app = require('../src/index');
const { verifyHitpaySignature } = require('../src/index');

const SALT = process.env.HITPAY_WEBHOOK_SALT;

// HitPay: hex HMAC-SHA256 of the raw body, keyed with the webhook's salt
function sign(body, salt = SALT) {
  return crypto.createHmac('sha256', salt).update(body).digest('hex');
}

const sampleBody = { id: '9e9a3451-a3e5-4fc5-9dfc-bc75e67c8808', status: 'succeeded', currency: 'sgd', amount: 913.84, refunded_amount: 0 };

function post({ body = JSON.stringify(sampleBody), object = 'charge', type = 'created', signature, contentType = 'application/json' } = {}) {
  const req = request(app).post('/webhooks/hitpay').set('Content-Type', contentType);
  if (object !== null) req.set('Hitpay-Event-Object', object);
  if (type !== null) req.set('Hitpay-Event-Type', type);
  req.set('Hitpay-Signature', signature === undefined ? sign(body) : signature);
  return req.send(body);
}

describe('HitPay webhook endpoint', () => {
  describe('signature verification', () => {
    it('accepts a valid signature', async () => {
      const res = await post();
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('accepts an uppercase hex signature', async () => {
      const body = JSON.stringify(sampleBody);
      const res = await post({ body, signature: sign(body).toUpperCase() });
      expect(res.status).toBe(200);
    });

    it('rejects a signature made with the wrong salt', async () => {
      const body = JSON.stringify(sampleBody);
      const res = await post({ body, signature: sign(body, 'api_key_salt') });
      expect(res.status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      const signature = sign(JSON.stringify(sampleBody));
      const res = await post({ body: JSON.stringify({ ...sampleBody, amount: 1 }), signature });
      expect(res.status).toBe(401);
    });

    it('rejects a missing signature', async () => {
      const res = await request(app)
        .post('/webhooks/hitpay')
        .set('Content-Type', 'application/json')
        .set('Hitpay-Event-Object', 'charge')
        .set('Hitpay-Event-Type', 'created')
        .send(JSON.stringify(sampleBody));
      expect(res.status).toBe(401);
    });

    it('rejects malformed signatures without throwing', async () => {
      for (const signature of ['', 'abc', 'zz'.repeat(32), sign('x') + 'ab', 'é'.repeat(64)]) {
        const res = await post({ signature });
        expect(res.status).toBe(401);
      }
    });

    it('verifies whatever the content type is', async () => {
      const res = await post({ contentType: 'text/plain' });
      expect(res.status).toBe(200);
    });

    it('rejects everything when the salt is not configured', () => {
      const body = Buffer.from('{}');
      expect(verifyHitpaySignature(body, sign(body), '')).toBe(false);
    });
  });

  describe('event dispatch', () => {
    const combos = [
      ['charge', 'created'], ['charge', 'updated'], ['order', 'created'], ['order', 'updated'],
      ['invoice', 'created'], ['invoice', 'updated'], ['payout', 'created'],
      ['transfer', 'paid'], ['transfer', 'failed'], ['transfer', 'canceled'],
    ];
    it.each(combos)('handles %s.%s', async (object, type) => {
      const res = await post({ object, type });
      expect(res.status).toBe(200);
    });

    it('returns 200 for an unknown event', async () => {
      const res = await post({ object: 'widget', type: 'created' });
      expect(res.status).toBe(200);
    });

    it('returns 400 when the event headers are missing', async () => {
      const res = await post({ object: null, type: null });
      expect(res.status).toBe(400);
    });
  });

  describe('body validation', () => {
    it('returns 400 for a signed body that is not JSON', async () => {
      const res = await post({ body: 'not json' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for a signed JSON array', async () => {
      const res = await post({ body: '[1]' });
      expect(res.status).toBe(400);
    });
  });
});
