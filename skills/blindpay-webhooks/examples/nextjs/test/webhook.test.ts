import crypto from 'crypto';
import { beforeEach, describe, expect, test } from 'vitest';
import { POST } from '../app/webhooks/blindpay/route';

// Svix-format secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Svix algorithm: base64(HMAC-SHA256(decoded secret, `${id}.${timestamp}.${body}`))
function sign(payload: string, msgId: string, timestamp: string, secret = TEST_SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${signature}`;
}

const now = () => Math.floor(Date.now() / 1000).toString();

// prefix: 'svix' (BlindPay as documented) or 'webhook' (Standard Webhooks names for the same values)
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
    new Request('http://localhost:3000/webhooks/blindpay', {
      method: 'POST',
      headers: { 'content-type': opts.contentType ?? 'application/json', ...headers },
      body: payload,
    })
  );
}

// BlindPay's body is flat: `webhook_event` followed by the resource's own fields (here a payin.complete payload from the docs)
function body(event: string, fields: Record<string, unknown> = {}): string {
  return JSON.stringify({
    webhook_event: event,
    id: 'pi_000000000000',
    status: 'completed',
    customer_id: 're_000000000000',
    receiver_amount: 10000,
    sender_amount: 10000,
    payment_method: 'ach',
    ...fields,
  });
}

// The 26 event types from the BlindPay event catalog
const EVENTS = [
  'customer.new',
  'customer.update',
  'customer.delete',
  'bankAccount.new',
  'blockchainWallet.new',
  'blockchainWallet.update',
  'tos.accept',
  'payin.new',
  'payin.update',
  'payin.complete',
  'payout.new',
  'payout.update',
  'payout.complete',
  'virtualAccount.new',
  'virtualAccount.complete',
  'transfer.new',
  'transfer.update',
  'transfer.complete',
  'wallet.new',
  'wallet.update',
  'wallet.inbound',
  'limitIncrease.new',
  'limitIncrease.update',
  'payable.new',
  'payable.update',
  'payable.complete',
];

describe('BlindPay webhook handler', () => {
  beforeEach(() => {
    process.env.BLINDPAY_WEBHOOK_SECRET = TEST_SECRET;
  });

  test.each(EVENTS)('handles event %s', async (event) => {
    const res = await send(body(event));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, event });
  });

  test('handles unknown events gracefully', async () => {
    const res = await send(body('something.new'));
    expect(res.status).toBe(200);
    expect((await res.json()).event).toBe('something.new');
  });

  test('handles a body without webhook_event', async () => {
    const res = await send('{}');
    expect(res.status).toBe(200);
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(body('payin.complete'), { contentType: 'application/octet-stream' });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed the same way but sent with webhook-* headers', async () => {
    const res = await send(body('payin.complete'), { prefix: 'webhook' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, event: 'payin.complete' });
  });

  test('rejects an invalid signature sent with webhook-* headers', async () => {
    const res = await send(body('payin.complete'), { prefix: 'webhook', signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = body('payout.complete');
    const msgId = 'msg_rotation';
    const timestamp = now();
    const signature = `v1,aW52YWxpZF9zaWduYXR1cmU= ${sign(payload, msgId, timestamp)}`;
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(200);
  });

  test('ignores signature versions other than v1', async () => {
    const payload = body('payout.complete');
    const msgId = 'msg_v1a';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp).replace('v1,', 'v1a,');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects missing headers', async () => {
    const res = await send('{}', { headers: {} });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Missing required webhook headers');
  });

  test('rejects an invalid signature', async () => {
    const res = await send(body('payin.complete'), { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = body('payin.complete');
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign(body('payin.new'), msgId, timestamp);
    const res = await send(body('payin.complete'), { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send(body('payin.complete'), { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Timestamp too old');
  });

  test('rejects a validly signed body that is not a JSON object', async () => {
    const res = await send('null');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid JSON');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.BLINDPAY_WEBHOOK_SECRET;
    const res = await send(body('payin.complete'));
    expect(res.status).toBe(500);
  });
});
