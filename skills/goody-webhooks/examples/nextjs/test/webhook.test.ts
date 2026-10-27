import crypto from 'crypto';
import { beforeEach, describe, expect, test } from 'vitest';
import { POST } from '../app/webhooks/goody/route';

// Svix-format secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Svix algorithm: base64(HMAC-SHA256(decoded secret, `${id}.${timestamp}.${body}`))
function sign(payload: string, msgId: string, timestamp: string, secret = TEST_SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${signature}`;
}

const now = () => Math.floor(Date.now() / 1000).toString();

// prefix: 'svix' (Goody) or 'webhook' (Standard Webhooks names for the same values)
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
    new Request('http://localhost:3000/webhooks/goody', {
      method: 'POST',
      headers: { 'content-type': opts.contentType ?? 'application/json', ...headers },
      body: payload,
    })
  );
}

const events: Record<string, Record<string, unknown>> = {
  'order_batch.created': { id: 'evt_01J', data: { id: 'batch_01J', send_status: 'complete' } },
  'order_batch.completed': { id: 'evt_01J', data: { id: 'batch_01J', send_status: 'complete' } },
  'order.created': { id: 'evt_01J', data: { id: 'ord_01J', status: 'created' } },
  'order.gift_opened': { id: 'evt_01J', data: { id: 'ord_01J', status: 'gift_opened' } },
  'order.gift_accepted': { id: 'evt_01J', data: { id: 'ord_01J', status: 'gift_accepted' } },
  'order.thank_you_note_added': { id: 'evt_01J', data: { id: 'ord_01J', status: 'thank_you_note_added' } },
  'order.shipped': { id: 'evt_01J', data: { id: 'ord_01J', status: 'shipped' } },
  'order.delivered': { id: 'evt_01J', data: { id: 'ord_01J', status: 'delivered' } },
  'order.canceled': { id: 'evt_01J', data: { id: 'ord_01J', status: 'canceled' } },
  'order.refunded': { id: 'evt_01J', data: { id: 'ord_01J', status: 'refunded' } },
  // the docs' example payloads still show the older gift_batch.* names
  'gift_batch.created': { id: 'evt_01J', data: { id: 'batch_01J', send_status: 'complete' } },
  'gift_batch.completed': { id: 'evt_01J', data: { id: 'batch_01J', send_status: 'complete' } },
};

describe('Goody webhook handler', () => {
  beforeEach(() => {
    process.env.GOODY_WEBHOOK_SECRET = TEST_SECRET;
  });

  test.each(Object.entries(events))('handles %s', async (type, data) => {
    const res = await send(JSON.stringify({ event_type: type, ...data }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type });
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(JSON.stringify({ event_type: 'goody.something.new' }));
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('goody.something.new');
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(JSON.stringify({ event_type: 'order.shipped', data: { id: 'ord_01J' } }), {
      contentType: 'application/octet-stream',
    });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed the same way but sent with webhook-* headers', async () => {
    const res = await send(JSON.stringify({ event_type: 'order.shipped', data: { id: 'ord_01J' } }), { prefix: 'webhook' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type: 'order.shipped' });
  });

  test('rejects an invalid signature sent with webhook-* headers', async () => {
    const res = await send('{"event_type":"order.shipped"}', { prefix: 'webhook', signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = JSON.stringify({ event_type: 'order.created' });
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
    const res = await send('{"event_type":"order.created"}', { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = '{"event_type":"order.created"}';
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign('{"event_type":"order.delivered"}', msgId, timestamp);
    const res = await send('{"event_type":"order.shipped"}', { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send('{"event_type":"order.created"}', { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.GOODY_WEBHOOK_SECRET;
    const res = await send('{"event_type":"order.created"}');
    expect(res.status).toBe(500);
  });
});
