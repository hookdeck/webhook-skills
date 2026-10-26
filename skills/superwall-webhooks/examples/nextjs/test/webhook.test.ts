import crypto from 'crypto';
import { beforeEach, describe, expect, test } from 'vitest';
import { POST } from '../app/webhooks/superwall/route';

// Svix-format secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Svix algorithm: base64(HMAC-SHA256(decoded secret, `${id}.${timestamp}.${body}`))
function sign(payload: string, msgId: string, timestamp: string, secret = TEST_SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${signature}`;
}

const now = () => Math.floor(Date.now() / 1000).toString();

// prefix: 'svix' (Superwall) or 'webhook' (Standard Webhooks names for the same values)
function send(
  payload: string,
  opts: { msgId?: string; timestamp?: string; signature?: string; headers?: Record<string, string>; contentType?: string; prefix?: string; extraHeaders?: Record<string, string> } = {}
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
    new Request('http://localhost:3000/webhooks/superwall', {
      method: 'POST',
      headers: { 'content-type': opts.contentType ?? 'application/json', ...headers, ...opts.extraHeaders },
      body: payload,
    })
  );
}

const TYPES = [
  'initial_purchase', 'renewal', 'non_renewing_purchase', 'product_change', 'cancellation', 'uncancellation',
  'refund', 'billing_issue', 'subscription_paused', 'subscription_extended', 'expiration', 'transferred',
];

// V2 envelope (snake_case); `id` is evt_ + 32 hex and stays the same across redelivery
function v2Event(type: string, eventData: Record<string, unknown> = {}) {
  return {
    id: 'evt_ea9c41ca861013812aa864e1807d5675',
    api_version: '2026-09-22',
    type,
    occurred_at: 1750000000000,
    project_id: '8712',
    app_user_id: 'user_1',
    ordering_key: '8712/user_1',
    is_family_share: false,
    pointer_mismatch: false,
    event_data: { id: `evt_abc:${type}`, name: type, store: 'APP_STORE', environment: 'PRODUCTION', product_id: 'com.example.pro.monthly', period_type: 'NORMAL', price: 9.99, proceeds: 8.49, ...eventData },
    subscription: { subscription_id: 'otxn_1', sequence: 1750000000000040, state: 'active', is_active: true, will_renew: true },
    previous: null,
    subscriber: { app_user_id: 'user_1', original_app_user_id: 'user_1', aliases: ['user_1'], identity_status: 'resolved', attributes: {} },
  };
}

// Legacy body (camelCase) with the event facts under `data`
function legacyEvent(type: string, data: Record<string, unknown> = {}) {
  return {
    object: 'event',
    type,
    projectId: 3827,
    applicationId: 1,
    timestamp: 1754067715103,
    data: { id: `42fc6339-dc28-470b-a0fa-0d13c92d8b61:${type}`, name: type, periodType: 'NORMAL', price: 9.99, productId: 'com.example.premium.monthly', store: 'APP_STORE', ...data },
  };
}

describe('Superwall webhook handler', () => {
  beforeEach(() => {
    process.env.SUPERWALL_WEBHOOK_SECRET = TEST_SECRET;
  });

  test.each(TYPES)('handles V2 %s', async (type: string) => {
    const res = await send(JSON.stringify(v2Event(type)), { extraHeaders: { superwall_version: '2' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type });
  });

  test.each(TYPES.filter((t) => t !== 'refund' && t !== 'transferred' && t !== 'subscription_extended'))(
    'handles legacy %s',
    async (type: string) => {
      const res = await send(JSON.stringify(legacyEvent(type)), { extraHeaders: { superwall_version: '1' } });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true, type });
    },
  );

  test('tells legacy from V2 by body shape when the superwall_version header is absent', async () => {
    const res = await send(JSON.stringify(legacyEvent('renewal', { isTrialConversion: true })));
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('renewal');
  });

  test('handles a V2 event whose owner is unknown (null subscriber and subscription)', async () => {
    const body = { ...v2Event('renewal'), app_user_id: null, subscription: null, subscriber: null };
    const res = await send(JSON.stringify(body));
    expect(res.status).toBe(200);
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(JSON.stringify({ type: 'superwall.something.new' }));
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('superwall.something.new');
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(JSON.stringify(v2Event('renewal')), {
      contentType: 'application/octet-stream',
    });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed the same way but sent with webhook-* headers', async () => {
    const res = await send(JSON.stringify(v2Event('renewal')), { prefix: 'webhook' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type: 'renewal' });
  });

  test('rejects an invalid signature sent with webhook-* headers', async () => {
    const res = await send('{"type":"renewal"}', { prefix: 'webhook', signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = JSON.stringify({ type: 'renewal' });
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
    const res = await send('{"type":"renewal"}', { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = '{"type":"renewal"}';
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign('{"type":"refund"}', msgId, timestamp);
    const res = await send('{"type":"renewal"}', { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send('{"type":"renewal"}', { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.SUPERWALL_WEBHOOK_SECRET;
    const res = await send('{"type":"renewal"}');
    expect(res.status).toBe(500);
  });
});
