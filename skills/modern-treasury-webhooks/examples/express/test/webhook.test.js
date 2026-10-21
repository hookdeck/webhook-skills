const request = require('supertest');
const crypto = require('crypto');

// Modern Treasury webhook keys are used as raw strings (no prefix, no decoding)
const WEBHOOK_KEY = 'test_webhook_key_for_modern_treasury';
process.env.MODERN_TREASURY_WEBHOOK_KEY = WEBHOOK_KEY;

const { app, verifySignature } = require('../src/index');

// Same algorithm as Modern Treasury: lowercase hex HMAC-SHA256 of the raw body
function sign(body, key = WEBHOOK_KEY) {
  return crypto.createHmac('sha256', key).update(body).digest('hex');
}

function send(body, { topic = 'payment_order', signature, webhookId, contentType = 'application/json' } = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  const req = request(app)
    .post('/webhooks/modern-treasury')
    .set('Content-Type', contentType)
    .set('X-Topic', topic)
    .set('X-Signature', signature === undefined ? sign(payload) : signature);
  if (webhookId) req.set('X-Webhook-ID', webhookId);
  return req.send(payload);
}

const completed = {
  event: 'completed',
  data: { id: '0198860a-5655-7dbc-9cbd-6616a8090fa8', object: 'payment_order', status: 'completed' }
};

describe('Modern Treasury webhook', () => {
  let logSpy;
  let errSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('accepts a payment_order.completed event with a valid signature', async () => {
    const res = await send(completed);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it.each([
    ['payment_order', 'failed'],
    ['payment_order', 'reconciled'],
    ['expected_payment', 'reconciled'],
    ['incoming_payment_detail', 'completed'],
    ['transaction', 'created'],
    ['return', 'created']
  ])('accepts %s.%s', async (topic, event) => {
    const res = await send({ event, data: { id: 'abc' } }, { topic });
    expect(res.status).toBe(200);
  });

  it('accepts unknown topic/event combinations after verifying them', async () => {
    const res = await send({ event: 'something_new', data: { id: 'x' } }, { topic: 'new_topic' });
    expect(res.status).toBe(200);
  });

  it('rejects an invalid signature', async () => {
    const res = await send(completed, { signature: 'a'.repeat(64) });
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with the wrong key', async () => {
    const payload = JSON.stringify(completed);
    const res = await send(payload, { signature: sign(payload, 'other_key') });
    expect(res.status).toBe(400);
  });

  it('rejects a signature of the wrong length without throwing', async () => {
    const res = await send(completed, { signature: 'abc123' });
    expect(res.status).toBe(400);
  });

  it('rejects a missing signature header', async () => {
    const res = await request(app)
      .post('/webhooks/modern-treasury')
      .set('Content-Type', 'application/json')
      .set('X-Topic', 'payment_order')
      .send(JSON.stringify(completed));
    expect(res.status).toBe(400);
  });

  it('rejects a body modified after signing', async () => {
    const signature = sign(JSON.stringify(completed));
    const tampered = JSON.stringify({ ...completed, event: 'failed' });
    const res = await send(tampered, { signature });
    expect(res.status).toBe(400);
  });

  it('signs the exact bytes received, not a re-serialized body', async () => {
    const raw = '{ "event":  "completed",\n "data": {"id": "spaced"} }';
    const res = await send(raw);
    expect(res.status).toBe(200);
  });

  it('verifies regardless of Content-Type', async () => {
    const res = await send(completed, { contentType: 'text/plain' });
    expect(res.status).toBe(200);
  });

  it('returns 400 for a validly signed body that is not JSON', async () => {
    const res = await send('not json');
    expect(res.status).toBe(400);
  });

  it('flags a retried webhook (same X-Webhook-ID) as a duplicate', async () => {
    const first = await send(completed, { webhookId: 'wh_retry_1' });
    const second = await send(completed, { webhookId: 'wh_retry_1' });
    expect(first.body).toEqual({ received: true });
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ received: true, duplicate: true });
  });

  it('returns 500 when the webhook key is not configured', async () => {
    delete process.env.MODERN_TREASURY_WEBHOOK_KEY;
    try {
      const res = await send(completed);
      expect(res.status).toBe(500);
    } finally {
      process.env.MODERN_TREASURY_WEBHOOK_KEY = WEBHOOK_KEY;
    }
  });
});

describe('verifySignature', () => {
  it('accepts a correctly signed body', () => {
    const body = Buffer.from('{"event":"created"}');
    expect(verifySignature(body, sign(body), WEBHOOK_KEY)).toBe(true);
  });

  it('accepts uppercase hex', () => {
    const body = Buffer.from('{"event":"created"}');
    expect(verifySignature(body, sign(body).toUpperCase(), WEBHOOK_KEY)).toBe(true);
  });

  it('returns false for missing inputs', () => {
    expect(verifySignature(Buffer.from('{}'), undefined, WEBHOOK_KEY)).toBe(false);
    expect(verifySignature(Buffer.from('{}'), 'abc', undefined)).toBe(false);
  });
});
