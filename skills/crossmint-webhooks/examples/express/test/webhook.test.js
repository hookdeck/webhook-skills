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
  { msgId = `msg_${crypto.randomBytes(12).toString('hex')}`, timestamp = now(), signature, contentType = 'application/json', prefix = 'svix' } = {}
) {
  return request(app)
    .post('/webhooks/crossmint')
    .set('Content-Type', contentType)
    .set(`${prefix}-id`, msgId)
    .set(`${prefix}-timestamp`, timestamp)
    .set(`${prefix}-signature`, signature ?? sign(payload, msgId, timestamp))
    .send(payload);
}

const wallet = (type) => ({
  id: 'evt_1b2c3d',
  type,
  data: { status: 'succeeded', token: { symbol: 'USDC', amount: '10', decimals: 6 }, sender: {}, recipient: {} },
});
const order = (type) => ({ actionId: '7723139d-fba3-474d-8e52-0ac7512d5c7b', type, data: { orderId: '7723139d', phase: 'payment' } });
const minting = (type) => ({
  actionId: 'a1b2', startedAt: '2026-01-01T00:00:00Z', completedAt: '2026-01-01T00:00:05Z', type, data: {}, resource: {},
});
const credential = (type) => ({ id: 'cred_1', type, data: { credential: { id: 'cred_1' } } });

const events = [
  ['wallets.transfer.in', wallet('wallets.transfer.in')],
  ['wallets.transfer.out', wallet('wallets.transfer.out')],
  ['wallets.signer.exported', wallet('wallets.signer.exported')],
  ['purchase.succeeded', { type: 'purchase.succeeded', status: 'success', walletAddress: '0xabc', txId: 'tx1' }],
  ['orders.quote.created', order('orders.quote.created')],
  ['orders.quote.updated', order('orders.quote.updated')],
  ['orders.payment.succeeded', order('orders.payment.succeeded')],
  ['orders.payment.failed', order('orders.payment.failed')],
  ['orders.delivery.initiated', order('orders.delivery.initiated')],
  ['orders.delivery.completed', order('orders.delivery.completed')],
  ['orders.delivery.failed', order('orders.delivery.failed')],
  ['collections.create.succeeded', minting('collections.create.succeeded')],
  ['collections.update.succeeded', minting('collections.update.succeeded')],
  ['nfts.create.succeeded', minting('nfts.create.succeeded')],
  ['nfts.create.failed', minting('nfts.create.failed')],
  ['nfts.update.succeeded', minting('nfts.update.succeeded')],
  ['credential.creation.succeeded', credential('credential.creation.succeeded')],
  ['credential.creation.failed', credential('credential.creation.failed')],
  [
    'payment_methods.status.updated',
    { id: 'pm-status-1', type: 'payment_methods.status.updated', data: { status: 'active' }, timestamp: '2026-01-01T00:00:00Z' },
  ],
];
const sample = wallet('wallets.transfer.in');

describe('Crossmint webhook handler', () => {
  beforeEach(() => {
    process.env.CROSSMINT_WEBHOOK_SECRET = TEST_SECRET;
  });

  test.each(events)('handles %s', async (type, body) => {
    const res = await send(JSON.stringify(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type });
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(JSON.stringify({ id: 'evt_x', type: 'wallets.something_new', data: {} }));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('wallets.something_new');
  });

  test('accepts a verified delivery with no type field', async () => {
    const res = await send(JSON.stringify({ id: 'evt_x', data: {} }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type: null });
  });

  test('rejects a verified body that is not a JSON object', async () => {
    const res = await send('[1,2]');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSON');
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(JSON.stringify(sample), { contentType: 'application/octet-stream' });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed the same way but sent with webhook-* headers', async () => {
    const res = await send(JSON.stringify(sample), { prefix: 'webhook' });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('wallets.transfer.in');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = JSON.stringify(sample);
    const msgId = 'msg_rotation';
    const timestamp = now();
    const signature = `v1,aW52YWxpZF9zaWduYXR1cmU= ${sign(payload, msgId, timestamp)}`;
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(200);
  });

  test('rejects missing headers', async () => {
    const res = await request(app).post('/webhooks/crossmint').set('Content-Type', 'application/json').send('{}');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required webhook headers');
  });

  test('rejects an invalid signature', async () => {
    const res = await send(JSON.stringify(sample), { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = JSON.stringify(sample);
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign(JSON.stringify({ ...sample, id: 'evt_other' }), msgId, timestamp);
    const res = await send(JSON.stringify(sample), { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('ignores signature versions other than v1', async () => {
    const payload = JSON.stringify(sample);
    const msgId = 'msg_v1a';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp).replace('v1,', 'v1a,');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send(JSON.stringify(sample), { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.CROSSMINT_WEBHOOK_SECRET;
    const res = await send(JSON.stringify(sample));
    expect(res.status).toBe(500);
  });

  test('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
