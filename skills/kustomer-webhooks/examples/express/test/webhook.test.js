const crypto = require('crypto');
const request = require('supertest');

// Kustomer's webhook token; any string works for tests.
const SECRET = 'test_kustomer_webhook_token';
process.env.KUSTOMER_WEBHOOK_SECRET = SECRET;

const app = require('../src/index');

function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function makeEvent(name, id = 'evt_' + Math.random().toString(36).slice(2)) {
  return JSON.stringify({
    id,
    name,
    org: '5f8481c6a22ab5b9d5f2dd8a',
    orgName: 'org-name',
    data: { type: 'customer', id: '608732dc0ac6b300195d5fb5', attributes: { name: 'Franz Kafka' } },
    createdAt: '2021-04-26T21:38:36.418Z',
    changes: null,
    persist: true,
  });
}

function post(body, signature, contentType = 'application/json') {
  const req = request(app).post('/webhooks/kustomer').set('Content-Type', contentType);
  if (signature !== undefined) req.set('X-Kustomer-Webhook-Signature', signature);
  return req.send(body);
}

describe('Kustomer webhook', () => {
  const events = [
    'kustomer.conversation.create',
    'kustomer.conversation.update',
    'kustomer.customer.create',
    'kustomer.customer.update',
    'kustomer.message.create',
    'kustomer.message.update',
  ];

  test.each(events)('accepts a valid %s event', async (name) => {
    const body = makeEvent(name);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });

  test('accepts unknown event names with a valid signature', async () => {
    const body = makeEvent('kustomer.team.create');
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  test('verifies regardless of content type', async () => {
    const body = makeEvent('kustomer.customer.create');
    const res = await post(body, sign(body), 'text/plain');
    expect(res.status).toBe(200);
  });

  test('rejects a missing signature', async () => {
    const res = await post(makeEvent('kustomer.customer.create'));
    expect(res.status).toBe(400);
  });

  test('rejects an invalid signature', async () => {
    const body = makeEvent('kustomer.customer.create');
    const res = await post(body, sign(body, 'wrong_secret'));
    expect(res.status).toBe(400);
  });

  test('rejects a signature of the wrong length', async () => {
    const res = await post(makeEvent('kustomer.customer.create'), 'abc123');
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const body = makeEvent('kustomer.customer.create');
    const res = await post(body.replace('Kafka', 'Samsa'), sign(body));
    expect(res.status).toBe(400);
  });

  test('rejects invalid JSON that is correctly signed', async () => {
    const body = 'not json';
    const res = await post(body, sign(body), 'text/plain');
    expect(res.status).toBe(400);
  });

  test('flags duplicate event ids', async () => {
    const body = makeEvent('kustomer.message.create', 'evt_dup');
    const first = await post(body, sign(body));
    const second = await post(body, sign(body));
    expect(first.body.duplicate).toBeUndefined();
    expect(second.body.duplicate).toBe(true);
  });
});
