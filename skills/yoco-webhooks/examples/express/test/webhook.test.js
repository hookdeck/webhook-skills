// Generated with: yoco-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Yoco secrets are "whsec_" + base64. The HMAC key is the base64-DECODED part
// after "whsec_".
const SECRET = 'whsec_' + Buffer.from('yoco-test-signing-key-0123456789').toString('base64');

process.env.YOCO_WEBHOOK_SECRET = SECRET;

const { app } = require('../src/index');

/** Sign exactly like Yoco (Standard Webhooks). */
function sign(rawBody, id, timestamp, secret = SECRET) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`, 'utf8')
    .digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);

function signedHeaders(rawBody, { id, timestamp, secret, signature } = {}) {
  const msgId = id || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(timestamp ?? now());
  return {
    'content-type': 'application/json',
    'webhook-id': msgId,
    'webhook-timestamp': ts,
    'webhook-signature': signature ?? sign(rawBody, msgId, ts, secret),
  };
}

function post(rawBody, headers) {
  return request(app).post('/webhooks/yoco').set(headers).send(rawBody);
}

// Yoco API payload (flat, `event_type`)
const yocoApiEvent = (eventType, extra = {}) => ({
  business_id: 'f3f777bb-ca3c-4638-bc79-8fcf0fd0f8f1',
  event_type: eventType,
  order_id: 'e13ed7f6-56a5-42f4-be6b-f87063ffd8f3',
  ...extra,
});

// Checkout API payload (`type` + nested `payload`)
const checkoutEvent = (type, payload) => ({
  createdDate: '2026-10-21T08:00:00.000Z',
  id: `evt_${crypto.randomUUID().replace(/-/g, '')}`,
  type,
  payload,
});

const paymentCreated = () =>
  yocoApiEvent('payment.created', { payment_id: 'd2ff5a9a-0998-46e2-aebe-2c72c3ddde1f' });

beforeEach(() => {
  process.env.YOCO_WEBHOOK_SECRET = SECRET;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('valid signatures — Yoco API events', () => {
  it('accepts payment.created', async () => {
    const body = JSON.stringify(paymentCreated());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('d2ff5a9a-0998-46e2-aebe-2c72c3ddde1f created')
    );
  });

  it('accepts payment.refunded', async () => {
    const body = JSON.stringify(
      yocoApiEvent('payment.refunded', { payment_id: 'd2ff5a9a-0998-46e2-aebe-2c72c3ddde1f' })
    );
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('refunded'));
  });

  it('accepts order.completed', async () => {
    const body = JSON.stringify(yocoApiEvent('order.completed'));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('order.completed'));
  });
});

describe('valid signatures — Checkout API events', () => {
  it('accepts payment.succeeded and reads metadata.checkoutId', async () => {
    const body = JSON.stringify(
      checkoutEvent('payment.succeeded', {
        amount: 2900,
        createdDate: '2026-10-21T08:00:00.000Z',
        currency: 'ZAR',
        id: 'p_8yN3kZ1qWx',
        metadata: { checkoutId: 'ch_KnqVxyzA2b' },
        mode: 'live',
        status: 'succeeded',
        type: 'payment',
        paymentMethodDetails: { type: 'card' },
      })
    );
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('ch_KnqVxyzA2b paid'));
  });

  it('accepts refund.failed', async () => {
    const body = JSON.stringify(
      checkoutEvent('refund.failed', {
        amount: 2900,
        createdDate: '2026-10-21T08:00:00.000Z',
        currency: 'ZAR',
        failureReason: 'Insufficient balance',
        id: 'rf_1a2b3c',
        mode: 'live',
        status: 'failed',
        type: 'refund',
      })
    );
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Insufficient balance'));
  });
});

describe('delivery behaviour', () => {
  it('acknowledges unknown event types with 200', async () => {
    const body = JSON.stringify(yocoApiEvent('something.new'));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('accepts when any one of several space-separated signatures matches', async () => {
    const body = JSON.stringify(paymentCreated());
    const headers = signedHeaders(body);
    headers['webhook-signature'] = `v1,bm90LXRoZS1yaWdodC1zaWc= ${headers['webhook-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('returns 200 for a duplicate webhook-id without reprocessing', async () => {
    const body = JSON.stringify(paymentCreated());
    const id = `msg_dup_${Date.now()}`;
    const first = await post(body, signedHeaders(body, { id }));
    const second = await post(body, signedHeaders(body, { id }));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ received: true, duplicate: true });
  });
});

describe('invalid requests', () => {
  it('rejects missing signature headers with 400', async () => {
    const body = JSON.stringify(paymentCreated());
    const res = await post(body, { 'content-type': 'application/json' });
    expect(res.status).toBe(400);
  });

  it('rejects a bad signature', async () => {
    const body = JSON.stringify(paymentCreated());
    const res = await post(body, signedHeaders(body, { signature: 'v1,aW52YWxpZA==' }));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with a different secret', async () => {
    const other = 'whsec_' + Buffer.from('some-other-secret-key-0123456789').toString('base64');
    const body = JSON.stringify(paymentCreated());
    const res = await post(body, signedHeaders(body, { secret: other }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(paymentCreated());
    const headers = signedHeaders(body);
    const res = await post(body.replace('payment.created', 'payment.refunded'), headers);
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp older than the 3-minute tolerance', async () => {
    // 4 minutes: inside the SDK's 5-minute default, outside Yoco's 3 minutes.
    const body = JSON.stringify(paymentCreated());
    const res = await post(body, signedHeaders(body, { timestamp: now() - 240 }));
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp too far in the future', async () => {
    const body = JSON.stringify(paymentCreated());
    const res = await post(body, signedHeaders(body, { timestamp: now() + 240 }));
    expect(res.status).toBe(400);
  });

  it('rejects signatures keyed with the undecoded secret string', async () => {
    const body = JSON.stringify(paymentCreated());
    const id = 'msg_undecoded';
    const ts = String(now());
    const wrong = crypto
      .createHmac('sha256', SECRET.slice('whsec_'.length))
      .update(`${id}.${ts}.${body}`)
      .digest('base64');
    const res = await post(body, signedHeaders(body, { id, timestamp: ts, signature: `v1,${wrong}` }));
    expect(res.status).toBe(400);
  });
});

describe('fail closed', () => {
  it('returns 500 when YOCO_WEBHOOK_SECRET is not set', async () => {
    delete process.env.YOCO_WEBHOOK_SECRET;
    const body = JSON.stringify(paymentCreated());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
  });
});
