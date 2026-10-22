const request = require('supertest');

// Set test environment variables before importing the app
process.env.XENDIT_CALLBACK_TOKEN = 'test_xendit_verification_token_0123456789';

const app = require('../src/index');
const { verifyXenditToken } = require('../src/index');

const TOKEN = process.env.XENDIT_CALLBACK_TOKEN;

// Payments API webhook (has an "event" field; resource is under "data")
function paymentPayload(event = 'payment.capture') {
  return {
    event,
    business_id: '603f1c4172bbe840979fd408',
    created: '2026-08-26T07:28:23.731Z',
    data: {
      payment_id: 'py-66269236-7447-450f-b0d8-ed4255b11d8a',
      payment_request_id: 'pr-c5a38204-58a9-4968-a8ad-68a79b172a66',
      payment_token_id: 'pt-1',
      id: 'rfd-1',
      reference_id: 'order-123',
      currency: 'IDR',
      request_amount: 1234,
      status: 'SUCCEEDED'
    }
  };
}

// Invoice callback (no "event" field)
function invoicePayload(status = 'PAID') {
  return { id: 'inv-1', external_id: 'order-123', status, amount: 50000, currency: 'IDR' };
}

function post(body = JSON.stringify(paymentPayload()), contentType = 'application/json') {
  return request(app).post('/webhooks/xendit').set('Content-Type', contentType).send(body);
}

describe('Xendit webhook endpoint', () => {
  describe('x-callback-token verification', () => {
    it('accepts the correct token', async () => {
      const res = await post().set('x-callback-token', TOKEN);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('rejects a wrong token of the same length', async () => {
      const res = await post().set('x-callback-token', 'x'.repeat(TOKEN.length));
      expect(res.status).toBe(401);
    });

    it('rejects a token of a different length without throwing', async () => {
      const res = await post().set('x-callback-token', 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing token', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('verifies regardless of content type (raw body)', async () => {
      const res = await post(JSON.stringify(paymentPayload()), 'text/plain').set('x-callback-token', TOKEN);
      expect(res.status).toBe(200);
    });
  });

  describe('Request handling', () => {
    it('returns 400 for an invalid JSON body', async () => {
      const res = await post('{not json').set('x-callback-token', TOKEN);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await post('[1,2,3]').set('x-callback-token', TOKEN);
      expect(res.status).toBe(400);
    });

    it('does not parse the body before verifying the token', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });

    it('handles every Payments API event', async () => {
      const events = [
        'payment.capture', 'payment.authorization', 'payment.failure', 'payment.expiry',
        'payment_request.expiry', 'payment_token.activation', 'payment_token.failure',
        'payment_token.expiry', 'refund.succeeded', 'refund.failed'
      ];
      for (const event of events) {
        const res = await post(JSON.stringify(paymentPayload(event))).set('x-callback-token', TOKEN);
        expect(res.status).toBe(200);
      }
    });

    it('handles invoice callbacks that have no event field', async () => {
      for (const status of ['PAID', 'EXPIRED']) {
        const res = await post(JSON.stringify(invoicePayload(status))).set('x-callback-token', TOKEN);
        expect(res.status).toBe(200);
      }
    });

    it('acknowledges unknown events', async () => {
      const res = await post(JSON.stringify(paymentPayload('something.else'))).set('x-callback-token', TOKEN);
      expect(res.status).toBe(200);
    });
  });

  describe('verifyXenditToken', () => {
    it('rejects everything when no token is configured', () => {
      expect(verifyXenditToken({ 'x-callback-token': '' }, '')).toBe(false);
      expect(verifyXenditToken({ 'x-callback-token': 'abc' }, undefined)).toBe(false);
    });

    it('rejects a missing header', () => {
      expect(verifyXenditToken({}, 'abc')).toBe(false);
    });

    it('accepts an exact match', () => {
      expect(verifyXenditToken({ 'x-callback-token': 'abc' }, 'abc')).toBe(true);
    });
  });

  describe('GET /health', () => {
    it('returns ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });
});
