const request = require('supertest');
const { createApp } = require('../src/index');

// Mollie webhooks are unsigned: the POST body is form-urlencoded and carries only
// an `id`. These tests inject a fake `fetchPayment` so we never call the real API,
// and assert the handler dispatches on the AUTHORITATIVE status it returns.

function appWith(fetchPayment) {
  return createApp({ fetchPayment });
}

describe('POST /webhooks/mollie', () => {
  it('returns 400 when the id is missing', async () => {
    const app = appWith(async () => {
      throw new Error('should not be called');
    });
    const res = await request(app)
      .post('/webhooks/mollie')
      .type('form')
      .send({});
    expect(res.status).toBe(400);
  });

  it('fetches the payment by the id from the form body (not the request status)', async () => {
    let fetchedId;
    const app = appWith(async (id) => {
      fetchedId = id;
      return { id, status: 'paid', amount: { currency: 'EUR', value: '10.00' } };
    });

    // Even if an attacker sends status=paid in the body, we ignore it and fetch.
    const res = await request(app)
      .post('/webhooks/mollie')
      .type('form')
      .send({ id: 'tr_abc123', status: 'ignored' });

    expect(res.status).toBe(200);
    expect(fetchedId).toBe('tr_abc123');
  });

  it('returns 200 for an unknown/deleted id (fetch returns null)', async () => {
    const app = appWith(async () => null);
    const res = await request(app)
      .post('/webhooks/mollie')
      .type('form')
      .send({ id: 'tr_unknown' });
    expect(res.status).toBe(200);
  });

  it('returns 500 when the Mollie API fetch fails (so Mollie retries)', async () => {
    const app = appWith(async () => {
      throw new Error('network down');
    });
    const res = await request(app)
      .post('/webhooks/mollie')
      .type('form')
      .send({ id: 'tr_transient' });
    expect(res.status).toBe(500);
  });

  it.each([
    'open',
    'pending',
    'authorized',
    'paid',
    'canceled',
    'expired',
    'failed',
    'some_future_status',
  ])('returns 200 and handles status %s', async (status) => {
    const app = appWith(async (id) => ({
      id,
      status,
      amount: { currency: 'EUR', value: '10.00' },
    }));
    const res = await request(app)
      .post('/webhooks/mollie')
      .type('form')
      .send({ id: `tr_${status}` });
    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
  });
});

describe('GET /health', () => {
  it('responds 200', async () => {
    const app = appWith(async () => null);
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
