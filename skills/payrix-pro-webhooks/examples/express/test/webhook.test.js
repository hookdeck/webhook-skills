// Generated with: payrix-pro-webhooks skill
// https://github.com/hookdeck/webhook-skills
process.env.PAYRIX_PRO_WEBHOOK_HEADER = 'X-Payrix-Secret';
process.env.PAYRIX_PRO_WEBHOOK_SECRET = 'Bearer test_payrix_pro_secret_0123456789';

const request = require('supertest');
const app = require('../src/index');
const { verifyPayrixProRequest, parseBody } = require('../src/index');

const HEADER = 'X-Payrix-Secret';
const SECRET = process.env.PAYRIX_PRO_WEBHOOK_SECRET;

// Illustrative payload: Payrix doesn't document the body shape.
const transactionAlert = { alert: 'transaction', transaction: { id: 't1_txn_example', total: 1500 } };
const merchantAlert = { alert: 'merchant', merchant: { id: 't1_mer_example', status: 1 } };

describe('Payrix Pro webhook', () => {
  describe('credential check', () => {
    it('accepts the exact header value', async () => {
      const res = await request(app).post('/webhooks/payrix-pro').set(HEADER, SECRET).send(transactionAlert);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await request(app).post('/webhooks/payrix-pro').set('x-payrix-secret', SECRET).send(merchantAlert);
      expect(res.status).toBe(200);
    });

    it('compares the whole value: a stripped Bearer prefix is rejected', async () => {
      const res = await request(app).post('/webhooks/payrix-pro').set(HEADER, SECRET.replace('Bearer ', '')).send(transactionAlert);
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await request(app).post('/webhooks/payrix-pro').set(HEADER, 'x'.repeat(SECRET.length)).send(transactionAlert);
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await request(app).post('/webhooks/payrix-pro').set(HEADER, 'short').send(transactionAlert);
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await request(app).post('/webhooks/payrix-pro').send(transactionAlert);
      expect(res.status).toBe(401);
    });

    it('does not read the default Authorization header when another name is configured', async () => {
      const res = await request(app).post('/webhooks/payrix-pro').set('Authorization', SECRET).send(transactionAlert);
      expect(res.status).toBe(401);
    });

    it('fails closed when no secret is configured', () => {
      expect(verifyPayrixProRequest({ 'x-payrix-secret': 'anything' }, '', 'X-Payrix-Secret')).toBe(false);
    });

    it('defaults the header name to Authorization', () => {
      const saved = process.env.PAYRIX_PRO_WEBHOOK_HEADER;
      delete process.env.PAYRIX_PRO_WEBHOOK_HEADER;
      try {
        expect(verifyPayrixProRequest({ authorization: SECRET })).toBe(true);
      } finally {
        process.env.PAYRIX_PRO_WEBHOOK_HEADER = saved;
      }
    });
  });

  describe('methods', () => {
    it.each(['get', 'post', 'put', 'patch', 'delete'])('accepts %s with the credential and an empty body', async (method) => {
      const res = await request(app)[method]('/webhooks/payrix-pro').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it.each(['get', 'put', 'patch', 'delete'])('checks the credential first for %s', async (method) => {
      const res = await request(app)[method]('/webhooks/payrix-pro').set(HEADER, 'nope');
      expect(res.status).toBe(401);
    });
  });

  describe('body handling', () => {
    it('accepts a JSON body', async () => {
      const res = await request(app).post('/webhooks/payrix-pro').set(HEADER, SECRET).send(merchantAlert);
      expect(res.status).toBe(200);
    });

    it('accepts form-encoded and plain text bodies', async () => {
      const form = await request(app).post('/webhooks/payrix-pro').set(HEADER, SECRET).type('form').send('alert=transaction&id=t1');
      expect(form.status).toBe(200);
      const text = await request(app).post('/webhooks/payrix-pro').set(HEADER, SECRET).set('Content-Type', 'text/plain').send('hello');
      expect(text.status).toBe(200);
    });

    it('returns 400 for malformed JSON declared as JSON', async () => {
      const res = await request(app).post('/webhooks/payrix-pro').set(HEADER, SECRET).set('Content-Type', 'application/json').send('{not json');
      expect(res.status).toBe(400);
    });

    it('authenticates before parsing: malformed JSON without the credential is 401', async () => {
      const res = await request(app).post('/webhooks/payrix-pro').set('Content-Type', 'application/json').send('{not json');
      expect(res.status).toBe(401);
    });

    it('parseBody keeps raw text for non-JSON content types', () => {
      expect(parseBody('a=1', 'application/x-www-form-urlencoded')).toEqual({ payload: 'a=1' });
      expect(parseBody('', 'application/json')).toEqual({ payload: null });
      expect(parseBody('{"a":1}', 'application/vnd.api+json')).toEqual({ payload: { a: 1 } });
    });
  });
});
