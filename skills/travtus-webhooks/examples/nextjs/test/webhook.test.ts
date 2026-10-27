import crypto from 'crypto';
import { beforeEach, describe, expect, test } from 'vitest';
import { POST } from '../app/webhooks/travtus/route';

// Svix-format secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Svix algorithm: base64(HMAC-SHA256(decoded secret, `${id}.${timestamp}.${body}`))
function sign(payload: string, msgId: string, timestamp: string, secret = TEST_SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${signature}`;
}

const now = () => Math.floor(Date.now() / 1000).toString();

// prefix: 'svix' (Travtus) or 'webhook' (Standard Webhooks names for the same values)
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
    new Request('http://localhost:3000/webhooks/travtus', {
      method: 'POST',
      headers: { 'content-type': opts.contentType ?? 'application/json', ...headers },
      body: payload,
    })
  );
}

const events: Record<string, Record<string, unknown>> = {
  'lease.update': {"identifier": "26d2f5f9-b128-48cd-add8-303e067df958", "start_date": "2024-01-01", "end_date": "2025-01-01", "rent": 1250, "notice_given": true},
  'task.create': {"identifier": "26d2f5f9-b128-48cd-add8-303e067df958", "title": "Fix shower", "status": "created", "importance": "high", "creator": {"email": "support@travtus.com", "first_name": "Bob", "last_name": "James"}},
  'task.update': {"identifier": "26d2f5f9-b128-48cd-add8-303e067df958", "title": "Fix shower", "status": "in_progress", "importance": "high", "creator": {"email": "support@travtus.com", "first_name": "Bob", "last_name": "James"}},
  'task.delete': {"identifier": "26d2f5f9-b128-48cd-add8-303e067df958", "title": "Fix shower", "status": "deleted", "importance": "high", "creator": {"email": "support@travtus.com", "first_name": "Bob", "last_name": "James"}},
  'sms.respond': {"message_id": "msg_response_123456", "conversation_id": "conv_abc123", "sender_name": "Travtus Assistant", "message_text": "Thanks for your inquiry! Would you like to schedule a tour?", "channel": "sms", "company_id": "company_789", "human_handover_ind": false, "portfolio_external_ref": "property_oak_towers"},
  'email.respond': {"message_id": "msg_response_123456", "conversation_id": "conv_abc123", "sender_name": "Travtus Assistant", "message_text": "Thanks for your inquiry! Would you like to schedule a tour?", "channel": "email", "company_id": "company_789", "human_handover_ind": false, "portfolio_external_ref": "property_oak_towers"},
  'web_chat.respond': {"message_id": "msg_response_123456", "conversation_id": "conv_abc123", "sender_name": "Travtus Assistant", "message_text": "Thanks for your inquiry! Would you like to schedule a tour?", "channel": "website", "company_id": "company_789", "human_handover_ind": false, "portfolio_external_ref": "property_oak_towers"},
};

const envelope = (type: string, body: unknown) =>
  JSON.stringify({ event_type: type, message_id: '51d155b3-496f-434e-b664-406836be35a0', body });

describe('Travtus webhook handler', () => {
  beforeEach(() => {
    process.env.TRAVTUS_WEBHOOK_SECRET = TEST_SECRET;
  });

  test.each(Object.entries(events))('handles %s', async (type, body) => {
    const res = await send(envelope(type, body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type });
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(JSON.stringify({ event_type: 'travtus.something.new' }));
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('travtus.something.new');
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(envelope('task.update', events['task.update']), {
      contentType: 'application/octet-stream',
    });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed the same way but sent with webhook-* headers', async () => {
    const res = await send(envelope('task.update', events['task.update']), { prefix: 'webhook' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type: 'task.update' });
  });

  test('rejects an invalid signature sent with webhook-* headers', async () => {
    const res = await send('{"event_type":"task.update"}', { prefix: 'webhook', signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = JSON.stringify({ event_type: 'task.update' });
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
    const res = await send('{"event_type":"task.update"}', { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = '{"event_type":"task.update"}';
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign('{"event_type":"task.delete"}', msgId, timestamp);
    const res = await send('{"event_type":"task.update"}', { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send('{"event_type":"task.update"}', { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.TRAVTUS_WEBHOOK_SECRET;
    const res = await send('{"event_type":"task.update"}');
    expect(res.status).toBe(500);
  });
});
