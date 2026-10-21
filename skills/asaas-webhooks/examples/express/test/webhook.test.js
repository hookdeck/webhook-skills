const request = require('supertest');

// Asaas authTokens are 32-255 characters with no whitespace.
const TOKEN = 'test_asaas_auth_token_0123456789abcdef';
process.env.ASAAS_WEBHOOK_TOKEN = TOKEN;

const app = require('../src/index');

function payload(overrides = {}) {
  return JSON.stringify({
    id: `evt_${Math.random().toString(36).slice(2)}`,
    event: 'PAYMENT_RECEIVED',
    dateCreated: '2024-06-12 16:45:03',
    payment: { object: 'payment', id: 'pay_080225913252', value: 100, status: 'RECEIVED' },
    ...overrides,
  });
}

function send(body, token = TOKEN) {
  const req = request(app).post('/webhooks/asaas').set('Content-Type', 'application/json');
  if (token !== null) req.set('asaas-access-token', token);
  return req.send(body);
}

describe('Asaas webhook', () => {
  it('accepts a valid token', async () => {
    const res = await send(payload());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it.each([
    'PAYMENT_CREATED',
    'PAYMENT_CONFIRMED',
    'PAYMENT_RECEIVED',
    'PAYMENT_OVERDUE',
    'PAYMENT_REFUNDED',
  ])('handles %s', async (event) => {
    const res = await send(payload({ event }));
    expect(res.status).toBe(200);
  });

  it('handles subscription and transfer events', async () => {
    expect((await send(payload({ event: 'SUBSCRIPTION_CREATED', subscription: { id: 'sub_1' } }))).status).toBe(200);
    expect((await send(payload({ event: 'TRANSFER_DONE', transfer: { id: 'tra_1' } }))).status).toBe(200);
  });

  it('accepts unknown events with 200', async () => {
    const res = await send(payload({ event: 'SOMETHING_NEW' }));
    expect(res.status).toBe(200);
  });

  it('rejects a wrong token', async () => {
    const res = await send(payload(), 'wrong_token_wrong_token_wrong_token_00');
    expect(res.status).toBe(401);
  });

  it('rejects a token of a different length', async () => {
    const res = await send(payload(), 'short');
    expect(res.status).toBe(401);
  });

  it('rejects a missing token', async () => {
    const res = await send(payload(), null);
    expect(res.status).toBe(401);
  });

  it('rejects invalid JSON after a valid token', async () => {
    const res = await send('{not json');
    expect(res.status).toBe(400);
  });

  it('rejects a body without an event', async () => {
    const res = await send(JSON.stringify({ id: 'evt_x' }));
    expect(res.status).toBe(400);
  });

  it('flags duplicate event ids', async () => {
    const body = payload({ id: 'evt_duplicate_1' });
    const first = await send(body);
    const second = await send(body);
    expect(first.body).toEqual({ received: true });
    expect(second.body).toEqual({ received: true, duplicate: true });
  });

  it('returns 500 when the token is not configured', async () => {
    delete process.env.ASAAS_WEBHOOK_TOKEN;
    const res = await send(payload());
    process.env.ASAAS_WEBHOOK_TOKEN = TOKEN;
    expect(res.status).toBe(500);
  });
});
