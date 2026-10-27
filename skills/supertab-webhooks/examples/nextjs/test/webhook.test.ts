import crypto from 'crypto';
import { beforeEach, describe, expect, test } from 'vitest';
import { POST } from '../app/webhooks/supertab/route';

// Svix-format secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Svix algorithm: base64(HMAC-SHA256(decoded secret, `${id}.${timestamp}.${body}`))
function sign(payload: string, msgId: string, timestamp: string, secret = TEST_SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${signature}`;
}

const now = () => Math.floor(Date.now() / 1000).toString();

// prefix: 'svix' (Supertab) or 'webhook' (Standard Webhooks names for the same values)
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
    new Request('http://localhost:3000/webhooks/supertab', {
      method: 'POST',
      headers: { 'content-type': opts.contentType ?? 'application/json', ...headers },
      body: payload,
    })
  );
}

const PURCHASE = {
    completed_at: '2025-05-15T12:24:04.097598Z',
    description: '1 Minute Time Pass',
    entitlement_status: { content_key: 'site.02acc452-e808-428f-8c64-0a5311d142bb', expires: '2025-05-15T12:25:04.074314Z', has_entitlement: true, recurs_at: null },
    id: 'purchase.bc5a1f06-07a7-46af-8907-e3a79e7d7a78',
    metadata: { title: 'Test Page', url: 'https://www.supertab.co/' },
    offering_id: 'offering.39e953e5-3b82-461e-bd7d-7b0c764e5b10',
    price: { amount: 25, currency: { base_unit: 100, code: 'USD', name: 'US Dollar', symbol: '$' } },
    purchased_at: '2025-05-15T12:24:04.074314Z',
    user: { email: 'test@supertab.co', first_name: 'Test', id: 'user.9125c850-7fe2-4350-9b6a-52fe9ea844d5', last_name: 'User' },
  };

const ONETIME_OFFERING = {
    id: 'onetime_offering.a3c0753a-2894-5cfb-8bba-976553b9fe42',
    items: [
      {
        description: 'First item',
        id: 'onetime_offering_item.4f2be578-a7de-7b3e-a2a2-9c34cbcc585f',
        metadata: { action: 'Promotions' },
        price: { amount: 2.99, currency: { base_unit: '100', code: 'USD', name: 'US Dollar', symbol: '$' } },
      },
    ],
    metadata: {},
    price: { amount: 2.99, currency: { base_unit: '100', code: 'USD', name: 'US Dollar', symbol: '$' } },
    status: 'purchasing_completed',
  };

// Event names carry a version suffix; the handler also accepts the unversioned form that the
// catalog's own purchase.completed example uses
const events: Record<string, Record<string, unknown>> = {
  'purchase.completed_2025-04-01': PURCHASE,
  'onetime_offering.purchasing_completed_2025-04-01': ONETIME_OFFERING,
  'purchase.completed': PURCHASE,
};

describe('Supertab webhook handler', () => {
  beforeEach(() => {
    process.env.SUPERTAB_WEBHOOK_SECRET = TEST_SECRET;
  });

  test.each(Object.entries(events))('handles %s', async (type, data) => {
    const res = await send(JSON.stringify({ type, data, metadata: {} }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type });
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(JSON.stringify({ type: 'supertab.something.new' }));
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('supertab.something.new');
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(JSON.stringify({ type: 'purchase.completed_2025-04-01', data: PURCHASE }), {
      contentType: 'application/octet-stream',
    });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed the same way but sent with webhook-* headers', async () => {
    const res = await send(JSON.stringify({ type: 'purchase.completed_2025-04-01', data: PURCHASE }), { prefix: 'webhook' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type: 'purchase.completed_2025-04-01' });
  });

  test('rejects an invalid signature sent with webhook-* headers', async () => {
    const res = await send('{"type":"purchase.completed_2025-04-01"}', { prefix: 'webhook', signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = JSON.stringify({ type: 'purchase.completed_2025-04-01' });
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
    const res = await send('{"type":"purchase.completed_2025-04-01"}', { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = '{"type":"purchase.completed_2025-04-01"}';
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign('{"type":"onetime_offering.purchasing_completed_2025-04-01"}', msgId, timestamp);
    const res = await send('{"type":"purchase.completed_2025-04-01"}', { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send('{"type":"purchase.completed_2025-04-01"}', { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.SUPERTAB_WEBHOOK_SECRET;
    const res = await send('{"type":"purchase.completed_2025-04-01"}');
    expect(res.status).toBe(500);
  });
});
