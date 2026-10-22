const request = require('supertest');
const crypto = require('crypto');

// Wave doesn't document a secret format; this one is only for tests
const SECRET = 'test_wave_webhook_secret_5f2a91c4';
process.env.WAVE_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

function sign(body, timestamp = Math.floor(Date.now() / 1000), secret = SECRET) {
  const v1 = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return { 'x-wave-signature': `t=${timestamp},v1=${v1}`, 'x-wave-timestamp': String(timestamp) };
}

function post(body, headers, contentType = 'application/json') {
  return request(app)
    .post('/webhooks/wave')
    .set('Content-Type', contentType)
    .set(headers)
    .send(body);
}

const paid = JSON.stringify({
  business_id: '63c77f29-875c-4cdc-947d-07430f628043',
  data: {
    amount_paid: '8.98',
    currency_code: 'USD',
    customer_id: '21840161',
    invoice_id: '2496756670638588934',
    paid_date: '2026-04-29',
    remaining_balance: '0.00',
  },
  event_id: '2f210c44-f1ab-551e-89fa-333fb8d2a5fe',
  event_type: 'invoice.paid',
});

describe('Wave webhook signature verification', () => {
  it('accepts a valid signature', async () => {
    const res = await post(paid, sign(paid));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('verifies any content type (raw body)', async () => {
    const res = await post(paid, sign(paid), 'text/plain');
    expect(res.status).toBe(200);
  });

  it('rejects a tampered body', async () => {
    const res = await post(paid.replace('8.98', '9999.00'), sign(paid));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const res = await post(paid, sign(paid, undefined, 'other_secret'));
    expect(res.status).toBe(400);
  });

  it('rejects a missing signature header', async () => {
    const res = await post(paid, {});
    expect(res.status).toBe(400);
  });

  it('rejects a malformed signature header', async () => {
    expect((await post(paid, { 'x-wave-signature': 'garbage' })).status).toBe(400);
    expect((await post(paid, { 'x-wave-signature': 't=abc,v1=deadbeef' })).status).toBe(400);
  });

  it('rejects a signature of a different length without throwing', async () => {
    const res = await post(paid, { 'x-wave-signature': `t=${Math.floor(Date.now() / 1000)},v1=abc` });
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp that was altered after signing', async () => {
    const headers = sign(paid);
    const forged = headers['x-wave-signature'].replace(/^t=\d+/, `t=${Math.floor(Date.now() / 1000) + 1}`);
    const res = await post(paid, { 'x-wave-signature': forged });
    expect(res.status).toBe(400);
  });

  it('accepts an old timestamp by default (retries and replays keep the original)', async () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    const res = await post(paid, sign(paid, old));
    expect(res.status).toBe(200);
  });

  it('rejects an old timestamp when WAVE_TIMESTAMP_TOLERANCE_SECONDS is set', async () => {
    process.env.WAVE_TIMESTAMP_TOLERANCE_SECONDS = '300';
    try {
      const old = Math.floor(Date.now() / 1000) - 3600;
      expect((await post(paid, sign(paid, old))).status).toBe(400);
      expect((await post(paid, sign(paid))).status).toBe(200);
    } finally {
      delete process.env.WAVE_TIMESTAMP_TOLERANCE_SECONDS;
    }
  });

  it('treats a non-numeric WAVE_TIMESTAMP_TOLERANCE_SECONDS as 0 (check off)', async () => {
    process.env.WAVE_TIMESTAMP_TOLERANCE_SECONDS = 'five minutes';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const old = Math.floor(Date.now() / 1000) - 3600;
      expect((await post(paid, sign(paid, old))).status).toBe(200);
    } finally {
      delete process.env.WAVE_TIMESTAMP_TOLERANCE_SECONDS;
      warn.mockRestore();
    }
  });

  it('rejects verified but invalid JSON', async () => {
    const body = '{not json';
    expect((await post(body, sign(body))).status).toBe(400);
  });
});

describe('Wave events', () => {
  it.each([
    ['invoice.sent', { invoice_id: '1', customer_id: '2', sent_method: 'WAVE' }],
    ['invoice.viewed', { invoice_id: '1', customer_id: '2' }],
    ['invoice.paid', { invoice_id: '1', amount_paid: '8.98', currency_code: 'USD' }],
    ['invoice.partially_paid', { invoice_id: '1', remaining_balance: '30.00' }],
    ['invoice.overdue', { invoice_id: '1', invoice_balance: '200.00' }],
    ['invoice.approved', { invoice_id: '1', amount: '200.00' }],
    ['estimate.sent', { estimate_id: '3', status: 'sent' }],
    ['estimate.accepted', { estimate_id: '3', status: 'accepted' }],
    ['checkout.paid', { checkout_id: '4', amount: '200.00', currency_code: 'USD' }],
    ['estimate.expired', { estimate_id: '3' }],
  ])('handles %s', async (event_type, data) => {
    const body = JSON.stringify({ event_id: 'e1', event_type, business_id: 'b1', data });
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });
});
