const crypto = require('node:crypto');
const request = require('supertest');
const app = require('../src/index');

// Standard Webhooks secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Standard Webhooks algorithm: base64(HMAC-SHA256(decoded secret, `${id}.${timestamp}.${body}`))
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
  { msgId = `msg_${crypto.randomBytes(12).toString('hex')}`, timestamp = now(), signature, contentType = 'application/json', prefix = 'webhook' } = {}
) {
  return request(app)
    .post('/webhooks/monerium')
    .set('Content-Type', contentType)
    .set(`${prefix}-id`, msgId)
    .set(`${prefix}-timestamp`, timestamp)
    .set(`${prefix}-signature`, signature ?? sign(payload, msgId, timestamp))
    .send(payload);
}

function envelope(type, data = {}) {
  return JSON.stringify({ type, data: { id: 'order-id', ...data } });
}

// Event names as listed at https://docs.monerium.com/private; data fields (id, state, meta, kind, amount,
// currency, chain, counterpart) are the ones its handler examples read, as no payload example is printed
const events = [
  ['order.created', { kind: 'issue', amount: '100.00', currency: 'eur', chain: 'gnosis', counterpart: { identifier: { standard: 'iban', iban: 'EE521273842688571285' } } }],
  ['order.updated', { state: 'placed', meta: {} }],
  ['subscription.created', {}],
];

describe('Monerium webhook handler', () => {
  let logSpy;
  let errorSpy;

  beforeEach(() => {
    process.env.MONERIUM_WEBHOOK_SECRET = TEST_SECRET;
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });

  test.each(events)('handles %s', async (type, data) => {
    const res = await send(envelope(type, data));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, type });
  });

  test('handles a processed order with transaction hashes', async () => {
    const res = await send(envelope('order.updated', { state: 'processed', meta: { txHashes: ['0xabc'] } }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, type: 'order.updated' });
  });

  test('handles a rejected order', async () => {
    const res = await send(envelope('order.updated', { state: 'rejected', meta: { rejectedReason: 'insufficient funds' } }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, type: 'order.updated' });
  });

  test('tolerates an order.updated body without meta', async () => {
    const res = await send(envelope('order.updated', { state: 'processed' }));
    expect(res.status).toBe(200);
  });

  test('acknowledges an event type it does not handle', async () => {
    const res = await send(envelope('some.future_event'));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('some.future_event');
  });

  test('accepts a delivery signed the same way but sent with svix-* headers', async () => {
    const res = await send(envelope('order.created'), { prefix: 'svix' });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('order.created');
  });

  test('prefers the webhook-* headers when both sets are present', async () => {
    const payload = envelope('order.created');
    const msgId = 'msg_both';
    const timestamp = now();
    const res = await request(app)
      .post('/webhooks/monerium')
      .set('Content-Type', 'application/json')
      .set('webhook-id', msgId)
      .set('webhook-timestamp', timestamp)
      .set('webhook-signature', sign(payload, msgId, timestamp))
      .set('svix-id', 'msg_other')
      .set('svix-timestamp', timestamp)
      .set('svix-signature', 'v1,AAAA')
      .send(payload);
    expect(res.status).toBe(200);
  });

  test('verifies the raw bytes whatever the content type', async () => {
    const res = await send(envelope('order.created'), { contentType: 'text/plain' });
    expect(res.status).toBe(200);
  });

  test('verifies the exact raw bytes, including odd whitespace', async () => {
    const payload = '{ "type" : "order.created",\n "data":{"id":"o", "state":"placed"} }';
    const res = await send(payload);
    expect(res.status).toBe(200);
  });

  test('accepts any matching v1 entry and ignores other versions', async () => {
    const payload = envelope('subscription.created');
    const msgId = 'msg_multi';
    const timestamp = now();
    const good = sign(payload, msgId, timestamp);
    const bad = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature: `v1a,ignored ${bad} ${good}` });
    expect(res.status).toBe(200);
  });

  test('rejects a missing signature header', async () => {
    const res = await request(app)
      .post('/webhooks/monerium')
      .set('Content-Type', 'application/json')
      .set('webhook-id', 'msg_1')
      .set('webhook-timestamp', now())
      .send(envelope('order.created'));
    expect(res.status).toBe(400);
  });

  test('rejects a request with no webhook headers', async () => {
    const res = await request(app)
      .post('/webhooks/monerium')
      .set('Content-Type', 'application/json')
      .send(envelope('order.created'));
    expect(res.status).toBe(400);
  });

  test('rejects an invalid signature', async () => {
    const res = await send(envelope('order.created'), { signature: 'v1,aW52YWxpZA==' });
    expect(res.status).toBe(401);
  });

  test('rejects a signature made with another secret', async () => {
    const payload = envelope('order.created');
    const msgId = 'msg_other_secret';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(401);
  });

  test('rejects a tampered body', async () => {
    const payload = envelope('order.created');
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp);
    const res = await send(envelope('order.updated'), { msgId, timestamp, signature });
    expect(res.status).toBe(401);
  });

  test('rejects a stale timestamp (library window is 5 minutes)', async () => {
    const payload = envelope('order.created');
    const msgId = 'msg_stale';
    const timestamp = (Math.floor(Date.now() / 1000) - 600).toString();
    const res = await send(payload, { msgId, timestamp, signature: sign(payload, msgId, timestamp) });
    expect(res.status).toBe(401);
  });

  test('returns 400 for a verified body that is not JSON', async () => {
    const res = await send('not json');
    expect(res.status).toBe(400);
  });

  test('fails closed when the secret is not configured', async () => {
    delete process.env.MONERIUM_WEBHOOK_SECRET;
    const res = await send(envelope('order.created'));
    expect(res.status).toBe(500);
  });

  test('fails closed when the secret is not a whsec_ secret', async () => {
    process.env.MONERIUM_WEBHOOK_SECRET = 'not-a-whsec-secret';
    const res = await send(envelope('order.created'));
    expect(res.status).toBe(500);
  });
});
