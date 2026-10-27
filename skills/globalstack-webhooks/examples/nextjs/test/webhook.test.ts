import crypto from 'crypto';
import { beforeEach, describe, expect, test } from 'vitest';
import { POST } from '../app/webhooks/globalstack/route';

// Svix-format secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Svix algorithm: base64(HMAC-SHA256(decoded secret, `${id}.${timestamp}.${body}`))
function sign(payload: string, msgId: string, timestamp: string, secret = TEST_SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${signature}`;
}

const now = () => Math.floor(Date.now() / 1000).toString();

// prefix: 'svix' (GlobalStack as documented) or 'webhook' (Standard Webhooks names for the same values)
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
    new Request('http://localhost:3000/webhooks/globalstack', {
      method: 'POST',
      headers: { 'content-type': opts.contentType ?? 'application/json', ...headers },
      body: payload,
    })
  );
}

// Every documented event, wrapped in GlobalStack's flat envelope
function envelope(type: string, object: Record<string, unknown> = {}): string {
  const [category] = type.split('.');
  return JSON.stringify({
    event_id: 'evt_1b8dbe64-1f4e-5a2c-9c31-6d9a51a0f0c2',
    event_type: type,
    event_category: category,
    event_developer_id: 'int_01HXYZABC1234567890ABCDEFG',
    api_version: 'v1',
    event_created_at: '2026-09-30T09:12:44.000Z',
    event_object_id: object.id ?? 'con_01KPBH8MD6R7YDJ82T4D6M3V1T',
    event_object_status: object.status ?? 'success',
    event_object_changes: { status: ['processing', 'success'] },
    event_object: object,
  });
}

const EVENT_TYPES = [
  'onramp.awaiting_deposit', 'onramp.funds_received', 'onramp.processing', 'onramp.success', 'onramp.failed', 'onramp.returned',
  'offramp.created', 'offramp.funds_received', 'offramp.processing', 'offramp.success', 'offramp.failed', 'offramp.returned',
  'conversion.created', 'conversion.funds_received', 'conversion.processing', 'conversion.success', 'conversion.failed', 'conversion.returned',
  'transfer.processing', 'transfer.success', 'transfer.failed',
  'deposit.received', 'deposit.held', 'deposit.confirmed', 'deposit.failed',
  'kyc.approved', 'kyc.rejected',
];

describe('GlobalStack webhook handler', () => {
  beforeEach(() => {
    process.env.GLOBALSTACK_WEBHOOK_SECRET = TEST_SECRET;
  });

  test('covers the 27 documented events', () => {
    expect(new Set(EVENT_TYPES).size).toBe(27);
  });

  test.each(EVENT_TYPES)('handles %s', async (type) => {
    const res = await send(envelope(type, { id: 'obj_01J', status: 'success', failure_reason: null }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type });
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(envelope('globalstack.something.new'));
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('globalstack.something.new');
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(envelope('conversion.success'), { contentType: 'application/octet-stream' });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed the same way but sent with webhook-* headers', async () => {
    const res = await send(envelope('onramp.success'), { prefix: 'webhook' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type: 'onramp.success' });
  });

  test('rejects an invalid signature sent with webhook-* headers', async () => {
    const res = await send(envelope('onramp.success'), { prefix: 'webhook', signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = envelope('deposit.confirmed');
    const msgId = 'msg_rotation';
    const timestamp = now();
    const signature = `v1,aW52YWxpZF9zaWduYXR1cmU= ${sign(payload, msgId, timestamp)}`;
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(200);
  });

  test('ignores signature versions other than v1', async () => {
    const payload = envelope('deposit.confirmed');
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
    const res = await send(envelope('conversion.success'), { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = envelope('conversion.success');
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign(envelope('conversion.failed'), msgId, timestamp);
    const res = await send(envelope('conversion.success'), { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send(envelope('conversion.success'), { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.GLOBALSTACK_WEBHOOK_SECRET;
    const res = await send(envelope('conversion.success'));
    expect(res.status).toBe(500);
  });
});
