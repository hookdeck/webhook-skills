const request = require('supertest');
const crypto = require('crypto');

const SECRET = 'test_dwolla_subscription_secret';
process.env.DWOLLA_WEBHOOK_SECRET = SECRET;

const app = require('../src/index');

// Dwolla: hex HMAC-SHA256 of the raw body, keyed with the subscription secret
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function makeEvent(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    resourceId: '36E9DCB2-889B-4873-8E52-0C9404EA002A',
    topic: 'customer_created',
    timestamp: '2015-10-22T14:44:11.407Z',
    _links: { self: { href: 'https://api-sandbox.dwolla.com/events/x' } },
    ...overrides,
  };
}

function post(body, signature) {
  const req = request(app)
    .post('/webhooks/dwolla')
    .set('Content-Type', 'application/vnd.dwolla.v1.hal+json');
  if (signature !== undefined) req.set('X-Request-Signature-SHA-256', signature);
  return req.send(body);
}

describe('Dwolla webhook', () => {
  it('accepts a valid signature', async () => {
    const body = JSON.stringify(makeEvent());
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });

  it.each([
    'customer_verified',
    'customer_funding_source_added',
    'customer_funding_source_verified',
    'customer_transfer_created',
    'customer_transfer_completed',
    'customer_transfer_failed',
    'customer_bank_transfer_completed',
    'some_unknown_topic',
  ])('handles %s', async (topic) => {
    const body = JSON.stringify(makeEvent({ topic }));
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  it('rejects an invalid signature', async () => {
    const body = JSON.stringify(makeEvent());
    const res = await post(body, 'a'.repeat(64));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = JSON.stringify(makeEvent());
    const res = await post(body, sign(body, 'wrong_secret'));
    expect(res.status).toBe(400);
  });

  it('rejects a missing signature', async () => {
    const res = await post(JSON.stringify(makeEvent()));
    expect(res.status).toBe(400);
  });

  it('rejects a signature of a different length', async () => {
    const res = await post(JSON.stringify(makeEvent()), 'short');
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(makeEvent());
    const res = await post(body.replace('customer_created', 'customer_verified'), sign(body));
    expect(res.status).toBe(400);
  });

  it('verifies against the raw body, not re-encoded JSON', async () => {
    const body = '{ "id":"evt-raw-1",  "topic":"customer_created", "resourceId":"r1" }';
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  it('returns 200 for a duplicate event ID', async () => {
    const body = JSON.stringify(makeEvent());
    const sig = sign(body);
    await post(body, sig);
    const res = await post(body, sig);
    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(true);
  });

  it('rejects a validly signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await post(body, sign(body));
    expect(res.status).toBe(400);
  });
});
