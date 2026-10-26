import crypto from 'crypto';
import { beforeEach, describe, expect, test } from 'vitest';
import { POST } from '../app/webhooks/privy/route';

// Svix-format secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Svix algorithm: base64(HMAC-SHA256(decoded secret, `${id}.${timestamp}.${body}`))
function sign(payload: string, msgId: string, timestamp: string, secret = TEST_SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${signature}`;
}

const now = () => Math.floor(Date.now() / 1000).toString();

// prefix: 'svix' (Privy) or 'webhook' (Standard Webhooks names for the same values)
function send(
  payload: string,
  opts: { msgId?: string; timestamp?: string; signature?: string; headers?: Record<string, string>; contentType?: string; prefix?: string } = {}
) {
  const msgId = opts.msgId ?? `msg_${crypto.randomBytes(12).toString('hex')}`;
  const timestamp = opts.timestamp ?? now();
  const prefix = opts.prefix ?? 'svix';
  const headers = opts.headers ?? {
    [`${prefix}-id`]: msgId,
    [`${prefix}-timestamp`]: timestamp,
    [`${prefix}-signature`]: opts.signature ?? sign(payload, msgId, timestamp),
  };
  return POST(
    new Request('http://localhost:3000/webhooks/privy', {
      method: 'POST',
      headers: { 'content-type': opts.contentType ?? 'application/json', ...headers },
      body: payload,
    })
  );
}

const events: Record<string, Record<string, unknown>> = {
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
    expect(await res.json()).toEqual({ success: true, type });
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(JSON.stringify({ type: 'privy.something.new' }));
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('privy.something.new');
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
    expect(await res.json()).toEqual({ success: true, type: 'transaction.confirmed' });
  });

  test('rejects an invalid signature sent with webhook-* headers', async () => {
    const res = await send('{"type":"transaction.confirmed"}', { prefix: 'webhook', signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
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
    const res = await send('{}', { headers: {} });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Missing required webhook headers');
  });

  test('rejects an invalid signature', async () => {
    const res = await send('{"type":"user.created"}', { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
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
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send('{"type":"user.created"}', { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.PRIVY_WEBHOOK_SECRET;
    const res = await send('{"type":"user.created"}');
    expect(res.status).toBe(500);
  });
});
