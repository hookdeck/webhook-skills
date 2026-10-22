const crypto = require('crypto');
const request = require('supertest');

// MoonPay webhook API keys look like wk_test_xxxxx and are used as a plain string
const API_KEY = 'wk_test_123';
process.env.MOONPAY_WEBHOOK_API_KEY = API_KEY;

const { app, verifyMoonpayWebhook } = require('../src/index');

function sign(body, key = API_KEY, t = Math.floor(Date.now() / 1000)) {
  const s = crypto.createHmac('sha256', key).update(`${t}.${body}`).digest('hex');
  return `t=${t},s=${s}`;
}

const post = (body, header, contentType = 'application/json') => {
  const r = request(app).post('/webhooks/moonpay').set('Content-Type', contentType);
  if (header) r.set('Moonpay-Signature-V2', header);
  return r.send(body);
};

describe('verifyMoonpayWebhook', () => {
  const body = JSON.stringify({ type: 'transaction_created', data: { id: 'tx_1' } });

  test('accepts a valid signature', () => {
    expect(verifyMoonpayWebhook(body, sign(body), API_KEY)).toBe(true);
  });

  test('matches the documented header shape', () => {
    // Header from the MoonPay docs: t=<unix>,s=<64 lowercase hex chars>
    expect(sign(body)).toMatch(/^t=\d+,s=[0-9a-f]{64}$/);
  });

  test('rejects wrong key', () => {
    expect(verifyMoonpayWebhook(body, sign(body, 'wk_test_other'), API_KEY)).toBe(false);
  });

  test('rejects tampered body', () => {
    expect(verifyMoonpayWebhook(body + ' ', sign(body), API_KEY)).toBe(false);
  });

  test('accepts an old timestamp by default (retries keep the original t)', () => {
    delete process.env.MOONPAY_TIMESTAMP_TOLERANCE_SECONDS;
    const old = Math.floor(Date.now() / 1000) - 86400;
    expect(verifyMoonpayWebhook(body, sign(body, API_KEY, old), API_KEY)).toBe(true);
  });

  test('rejects an old timestamp with an explicit tolerance', () => {
    const old = Math.floor(Date.now() / 1000) - 600;
    expect(verifyMoonpayWebhook(body, sign(body, API_KEY, old), API_KEY, 300)).toBe(false);
  });

  test('rejects an old timestamp when MOONPAY_TIMESTAMP_TOLERANCE_SECONDS is set', () => {
    process.env.MOONPAY_TIMESTAMP_TOLERANCE_SECONDS = '300';
    try {
      const old = Math.floor(Date.now() / 1000) - 600;
      expect(verifyMoonpayWebhook(body, sign(body, API_KEY, old), API_KEY)).toBe(false);
    } finally {
      delete process.env.MOONPAY_TIMESTAMP_TOLERANCE_SECONDS;
    }
  });

  test('treats a non-numeric MOONPAY_TIMESTAMP_TOLERANCE_SECONDS as 0 (check off)', () => {
    process.env.MOONPAY_TIMESTAMP_TOLERANCE_SECONDS = 'five minutes';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const old = Math.floor(Date.now() / 1000) - 600;
      expect(verifyMoonpayWebhook(body, sign(body, API_KEY, old), API_KEY)).toBe(true);
    } finally {
      delete process.env.MOONPAY_TIMESTAMP_TOLERANCE_SECONDS;
      warn.mockRestore();
    }
  });

  test('stale timestamp passes with a wider tolerance', () => {
    const old = Math.floor(Date.now() / 1000) - 600;
    expect(verifyMoonpayWebhook(body, sign(body, API_KEY, old), API_KEY, 900)).toBe(true);
  });

  test('rejects malformed or missing headers', () => {
    expect(verifyMoonpayWebhook(body, 'garbage', API_KEY)).toBe(false);
    expect(verifyMoonpayWebhook(body, 't=abc,s=00', API_KEY)).toBe(false);
    expect(verifyMoonpayWebhook(body, `t=${Math.floor(Date.now() / 1000)}`, API_KEY)).toBe(false);
    expect(verifyMoonpayWebhook(body, undefined, API_KEY)).toBe(false);
  });
});

describe('POST /webhooks/moonpay', () => {
  const events = [
    { type: 'transaction_created', data: { id: 'tx_1', status: 'waitingPayment' } },
    { type: 'transaction_updated', data: { id: 'tx_1', status: 'completed' } },
    { type: 'transaction_failed', data: { id: 'tx_1', status: 'failed', failureReason: 'card_not_supported' } },
    { type: 'sell_transaction_created', data: { id: 'stx_1', status: 'waitingForDeposit' } },
    { type: 'sell_transaction_updated', data: { id: 'stx_1', status: 'completed' } },
    { type: 'sell_transaction_failed', data: { id: 'stx_1', status: 'failed' } },
    { type: 'sell_transaction_requote_required', data: { id: 'stx_1' } },
    { type: 'identity_check_updated', data: { id: 'ic_1', status: 'completed' } },
    { id: 'evt_1', type: 'customer.identity_status_updated', timestamp: '2026-01-01T00:00:00Z', data: { customerId: 'cus_1', status: 'verified' } },
    { type: 'somethingNew', data: {} },
  ];

  test.each(events)('returns 200 for a valid $type event', async (event) => {
    const body = JSON.stringify(event);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  test('verifies a body sent with a non-JSON content type', async () => {
    const body = JSON.stringify(events[0]);
    const res = await post(body, sign(body), 'text/plain');
    expect(res.status).toBe(200);
  });

  test('returns 400 for an invalid signature', async () => {
    const body = JSON.stringify(events[0]);
    const res = await post(body, sign(body, 'wk_test_wrong'));
    expect(res.status).toBe(400);
  });

  test('returns 400 for a missing header', async () => {
    const res = await post(JSON.stringify(events[0]));
    expect(res.status).toBe(400);
  });

  test('returns 400 for validly signed invalid JSON', async () => {
    const body = 'not json';
    const res = await post(body, sign(body));
    expect(res.status).toBe(400);
  });

  test('health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
