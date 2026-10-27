import crypto from 'node:crypto';
import request from 'supertest';
import { app } from '../src/index.js';

// Svix-format secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Svix algorithm: base64(HMAC-SHA256(decoded secret, `${id}.${timestamp}.${body}`))
function sign(payload, msgId, timestamp, secret = TEST_SECRET) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${signature}`;
}

function now() {
  return Math.floor(Date.now() / 1000).toString();
}

function send(
  payload,
  { msgId = `msg_${crypto.randomBytes(12).toString('hex')}`, timestamp = now(), signature, contentType = 'application/json', eventType = 'alert.created', prefix = 'svix' } = {}
) {
  const req = request(app)
    .post('/webhooks/chargeblast')
    .set('Content-Type', contentType)
    .set(`${prefix}-id`, msgId)
    .set(`${prefix}-timestamp`, timestamp)
    .set(`${prefix}-signature`, signature ?? sign(payload, msgId, timestamp));
  if (eventType) req.set('X-Event-Type', eventType);
  return req.send(payload);
}

const alert = {
  alertId: 'al_genericId123',
  alertType: 'FRAUD',
  amount: 500.0,
  attributes: { order_number: '#1533' },
  arn: '12345678901234567890123',
  authCode: 'ABC123',
  card: '123456xxxxxxx7890',
  cardBrand: 'visa',
  createdAt: '2024-10-31 21:57:23.601000Z',
  currency: 'usd',
  customerEmail: 'customer@example.com',
  id: 'al_genericId123',
  merchantId: 'cb_genericMerchantId',
  provider: 'exampleProvider',
  subprovider: 'Ethoca',
  transactionDate: '2024-09-30 00:00:00.000000Z',
};

const deflection = {
  id: 'def_4xUCdBXVs23u03i51cpQBJ',
  type: 'CE',
  status: 'Succeeded',
  amount: 49.99,
  currency: 'USD',
  chargeId: 'ch_0ab931c9139b0c8519c',
  customerEmail: 'customer@example.com',
  fees: 0.75,
  merchantId: 'cb_genericMerchantId',
};

const events = [
  ['alert.created', alert],
  ['alert.updated', alert],
  ['alert.refunded', alert],
  ['alert.matched', alert],
  ['alert.will_expire', alert],
  ['alert.within_refund_rules', alert],
  ['deflection.created', deflection],
  ['deflection.updated', deflection],
];

describe('Chargeblast webhook handler', () => {
  beforeEach(() => {
    process.env.CHARGEBLAST_WEBHOOK_SECRET = TEST_SECRET;
  });

  test.each(events)('handles %s', async (type, body) => {
    const res = await send(JSON.stringify(body), { eventType: type });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type });
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(JSON.stringify(alert), { eventType: 'alert.something_new' });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('alert.something_new');
  });

  test('accepts a verified delivery without an X-Event-Type header', async () => {
    const res = await send(JSON.stringify(alert), { eventType: null });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type: null });
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(JSON.stringify(alert), { contentType: 'application/octet-stream' });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed the same way but sent with webhook-* headers', async () => {
    const res = await send(JSON.stringify(alert), { prefix: 'webhook', eventType: 'alert.updated' });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('alert.updated');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = JSON.stringify(alert);
    const msgId = 'msg_rotation';
    const timestamp = now();
    const signature = `v1,aW52YWxpZF9zaWduYXR1cmU= ${sign(payload, msgId, timestamp)}`;
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(200);
  });

  test('rejects missing headers', async () => {
    const res = await request(app).post('/webhooks/chargeblast').set('Content-Type', 'application/json').send('{}');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required webhook headers');
  });

  test('rejects an invalid signature', async () => {
    const res = await send(JSON.stringify(alert), { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = JSON.stringify(alert);
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign(JSON.stringify({ ...alert, amount: 5.0 }), msgId, timestamp);
    const res = await send(JSON.stringify(alert), { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('ignores signature versions other than v1', async () => {
    const payload = JSON.stringify(alert);
    const msgId = 'msg_v1a';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp).replace('v1,', 'v1a,');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send(JSON.stringify(alert), { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.CHARGEBLAST_WEBHOOK_SECRET;
    const res = await send(JSON.stringify(alert));
    expect(res.status).toBe(500);
  });

  test('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
