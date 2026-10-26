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

// prefix: 'svix' (Privy) or 'webhook' (Standard Webhooks names for the same values)
function send(payload, { msgId = `msg_${crypto.randomBytes(12).toString('hex')}`, timestamp = now(), signature, contentType = 'application/json', prefix = 'svix' } = {}) {
  return request(app)
    .post('/webhooks/privy')
    .set('Content-Type', contentType)
    .set(`${prefix}-id`, msgId)
    .set(`${prefix}-timestamp`, timestamp)
    .set(`${prefix}-signature`, signature ?? sign(payload, msgId, timestamp))
    .send(payload);
}

const events = {
  'privy.test': { message: 'Hello, World!' },
  'user.created': { user: { id: 'did:privy:cm1' } },
  'user.authenticated': { user: { id: 'did:privy:cm1' } },
  'user.linked_account': { user: { id: 'did:privy:cm1' } },
  'user.unlinked_account': { user: { id: 'did:privy:cm1' } },
  'user.wallet_created': { user: { id: 'did:privy:cm1' } },
  'user.deleted': { user: { id: 'did:privy:cm1' } },
  'mfa.enabled': { user: { id: 'did:privy:cm1' } },
  'mfa.disabled': { user: { id: 'did:privy:cm1' } },
  'wallet.funds_deposited': { wallet_id: 'w_01' },
  'wallet.funds_withdrawn': { wallet_id: 'w_01' },
  'wallet.private_key_export': { wallet_id: 'w_01' },
  'transaction.broadcasted': { wallet_id: 'w_01', transaction_hash: '0xabc' },
  'transaction.confirmed': { wallet_id: 'w_01', transaction_hash: '0xabc' },
  'transaction.failed': { wallet_id: 'w_01' },
  'transaction.execution_reverted': { wallet_id: 'w_01', transaction_hash: '0xabc' },
  'wallet_action.swap.created': { wallet_id: 'w_01' },
  'wallet_action.swap.succeeded': { wallet_id: 'w_01' },
  'wallet_action.swap.failed': { wallet_id: 'w_01' },
  'intent.created': { intent_id: 'int_01' },
  'intent.executed': { intent_id: 'int_01' },
  'user_operation.completed': { wallet_id: 'w_01' },
};

describe('Privy webhook handler', () => {
  beforeEach(() => {
    process.env.PRIVY_WEBHOOK_SECRET = TEST_SECRET;
  });

  test.each(Object.entries(events))('handles %s', async (type, data) => {
    const res = await send(JSON.stringify({ type: type, ...data }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type });
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(JSON.stringify({ type: 'privy.something.new' }));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('privy.something.new');
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(JSON.stringify({ type: 'transaction.confirmed', wallet_id: 'w_01' }), {
      contentType: 'application/octet-stream',
    });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed the same way but sent with webhook-* headers', async () => {
    const res = await send(JSON.stringify({ type: 'transaction.confirmed', wallet_id: 'w_01' }), { prefix: 'webhook' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type: 'transaction.confirmed' });
  });

  test('rejects an invalid signature sent with webhook-* headers', async () => {
    const res = await send('{"type":"transaction.confirmed"}', { prefix: 'webhook', signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = JSON.stringify({ type: 'user.created' });
    const msgId = 'msg_rotation';
    const timestamp = now();
    const signature = `v1,aW52YWxpZF9zaWduYXR1cmU= ${sign(payload, msgId, timestamp)}`;
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(200);
  });

  test('rejects missing headers', async () => {
    const res = await request(app).post('/webhooks/privy').set('Content-Type', 'application/json').send('{}');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required webhook headers');
  });

  test('rejects an unsigned delivery', async () => {
    const res = await request(app).post('/webhooks/privy').set('Content-Type', 'application/json').send('{"type":"user.created"}');
    expect(res.status).toBe(400);
  });

  test('rejects an invalid signature', async () => {
    const res = await send('{"type":"user.created"}', { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = '{"type":"user.created"}';
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign('{"type":"transaction.failed"}', msgId, timestamp);
    const res = await send('{"type":"transaction.confirmed"}', { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send('{"type":"user.created"}', { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.PRIVY_WEBHOOK_SECRET;
    const res = await send('{"type":"user.created"}');
    expect(res.status).toBe(500);
  });

  test('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
