const request = require('supertest');

// Set test environment variables before importing the app
process.env.PAYJP_WEBHOOK_SECRET = 'whook_a09d5c1c87be4e1590a9f16516';

const app = require('../src/index');
const { verifyPayjpRequest, seenEvents } = require('../src/index');

const TOKEN = process.env.PAYJP_WEBHOOK_SECRET;
const HEADER = 'X-Payjp-Webhook-Token';

const EVENTS = [
  'charge.succeeded', 'charge.failed', 'charge.updated', 'charge.refunded', 'charge.captured',
  'dispute.created', 'customer.created', 'customer.updated', 'customer.deleted',
  'subscription.created', 'subscription.renewed', 'subscription.canceled', 'transfer.succeeded'
];

let counter = 0;

// Based on the charge.succeeded example in PAY.JP's webhook guide.
function samplePayload(type = 'charge.succeeded', id = `evnt_test_${++counter}`) {
  return {
    created: 1442212986,
    data: {
      amount: 5000,
      amount_refunded: 0,
      captured: true,
      captured_at: 1442212986,
      card: { brand: 'Visa', id: 'car_f0984a6f68a730b7e1814ceabfe1', last4: '4242', object: 'card' },
      created: 1442212986,
      currency: 'jpy',
      customer: null,
      failure_code: null,
      id: 'ch_bcb7776459913c743c20e9f9351d4',
      livemode: false,
      object: 'charge',
      paid: true,
      refunded: false,
      subscription: null
    },
    id,
    livemode: false,
    object: 'event',
    pending_webhooks: 1,
    type
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/payjp')
    .set('Content-Type', contentType)
    .send(body);
}

beforeEach(() => seenEvents.clear());

describe('PAY.JP webhook endpoint', () => {
  describe('X-Payjp-Webhook-Token verification', () => {
    it('accepts the correct token', async () => {
      const res = await post().set(HEADER, TOKEN);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('x-payjp-webhook-token', TOKEN);
      expect(res.status).toBe(200);
    });

    it('rejects a wrong token of the same length', async () => {
      const res = await post().set(HEADER, 'x'.repeat(TOKEN.length));
      expect(res.status).toBe(401);
    });

    it('rejects a token of a different length without throwing', async () => {
      const res = await post().set(HEADER, 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a token with extra characters (whole value is compared)', async () => {
      const res = await post().set(HEADER, `${TOKEN}-extra`);
      expect(res.status).toBe(401);
    });

    it('rejects a missing token', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('does not accept the token as an Authorization bearer', async () => {
      const res = await post().set('Authorization', `Bearer ${TOKEN}`);
      expect(res.status).toBe(401);
    });

    it('rejects everything when no secret is configured', () => {
      expect(verifyPayjpRequest({ 'x-payjp-webhook-token': TOKEN }, '')).toBe(false);
      expect(verifyPayjpRequest({ 'x-payjp-webhook-token': TOKEN }, null)).toBe(false);
    });

    it('verifies directly against a given secret', () => {
      expect(verifyPayjpRequest({ 'x-payjp-webhook-token': TOKEN }, TOKEN)).toBe(true);
      expect(verifyPayjpRequest({ 'x-payjp-webhook-token': 'nope' }, TOKEN)).toBe(false);
      expect(verifyPayjpRequest({}, TOKEN)).toBe(false);
    });
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set(HEADER, TOKEN);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set(HEADER, TOKEN);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a JSON value that is not an event', async () => {
      const res = await post(JSON.stringify([1, 2])).set(HEADER, TOKEN);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for a bad token with an invalid body', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('event handling', () => {
    it.each(EVENTS)('handles %s', async (type) => {
      const res = await post(JSON.stringify(samplePayload(type))).set(HEADER, TOKEN);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('returns 200 for an unhandled event type', async () => {
      const res = await post(JSON.stringify(samplePayload('plan.created'))).set(HEADER, TOKEN);
      expect(res.status).toBe(200);
    });

    it('dedupes a repeated event id', async () => {
      const body = JSON.stringify(samplePayload('charge.succeeded', 'evnt_dup'));
      const first = await post(body).set(HEADER, TOKEN);
      const second = await post(body).set(HEADER, TOKEN);
      expect(first.body).toEqual({ received: true });
      expect(second.status).toBe(200);
      expect(second.body).toEqual({ received: true, duplicate: true });
    });
  });

  it('health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
