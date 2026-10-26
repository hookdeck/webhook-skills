import crypto from 'crypto';
import { beforeEach, describe, expect, test } from 'vitest';
import { POST } from '../app/webhooks/novu/route';

// Svix-format secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Svix algorithm: base64(HMAC-SHA256(decoded secret, `${id}.${timestamp}.${body}`))
function sign(payload: string, msgId: string, timestamp: string, secret = TEST_SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${signature}`;
}

const now = () => Math.floor(Date.now() / 1000).toString();

// prefix: 'webhook' (Novu's Standard Webhooks names) or 'svix' (the same values under Svix's names)
function send(
  payload: string,
  opts: { msgId?: string; timestamp?: string; signature?: string; headers?: Record<string, string>; contentType?: string; prefix?: string } = {}
) {
  const msgId = opts.msgId ?? `msg_${crypto.randomBytes(12).toString('hex')}`;
  const timestamp = opts.timestamp ?? now();
  const prefix = opts.prefix ?? 'webhook';
  const headers = opts.headers ?? {
    [`${prefix}-id`]: msgId,
    [`${prefix}-timestamp`]: timestamp,
    [`${prefix}-signature`]: opts.signature ?? sign(payload, msgId, timestamp),
  };
  return POST(
    new Request('http://localhost:3000/webhooks/novu', {
      method: 'POST',
      headers: { 'content-type': opts.contentType ?? 'application/json', ...headers },
      body: payload,
    })
  );
}

// Documented `data` shapes: messages use `_id`, preferences add `subscriberId`, inbound email has `mail`
function dataFor(type: string, object: string): Record<string, unknown> {
  if (object === 'email_inbound') {
    return { object: { domain: { id: 'domain_01J', name: 'mail.example.com' }, route: { address: 'support' }, mail: { subject: 'Re: Your order' } } };
  }
  if (object === 'preference') {
    return { subscriberId: 'subscriber_123', object: { level: 'global', enabled: true, channels: { email: true } } };
  }
  if (object === 'workflow') {
    return { object: { workflowId: 'order-shipped', name: 'Order shipped' }, ...(type === 'workflow.updated' ? { previousObject: { _id: 'wf_01J' } } : {}) };
  }
  const failed = type === 'message.failed';
  return { object: { _id: 'message_01J', subscriberId: 'subscriber_123', channel: 'push', status: failed ? 'error' : 'sent' }, ...(failed ? { error: { message: 'Requested entity was not found.' } } : {}) };
}

// Envelope: { id, type, object, timestamp, environmentId, data: { object, previousObject? } }
function envelope(type: string, object: string): string {
  return JSON.stringify({
    id: 'evt_01J',
    type,
    object,
    timestamp: '2026-10-26T12:00:00.000Z',
    environmentId: 'env_01J',
    data: dataFor(type, object),
  });
}

// Every documented event type and the resource kind in the top-level `object`
const events: Record<string, string> = {
  'email.received': 'email_inbound',
  'message.archived': 'message',
  'message.deleted': 'message',
  'message.delivered': 'message',
  'message.failed': 'message',
  'message.read': 'message',
  'message.seen': 'message',
  'message.sent': 'message',
  'message.snoozed': 'message',
  'message.unarchived': 'message',
  'message.unread': 'message',
  'message.unsnoozed': 'message',
  'preference.updated': 'preference',
  'workflow.created': 'workflow',
  'workflow.deleted': 'workflow',
  'workflow.published': 'workflow',
  'workflow.updated': 'workflow',
};

describe('Novu webhook handler', () => {
  beforeEach(() => {
    process.env.NOVU_WEBHOOK_SECRET = TEST_SECRET;
  });

  test.each(Object.entries(events))('handles %s', async (type, object) => {
    const res = await send(envelope(type, object));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type });
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(envelope('novu.something.new', 'message'));
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('novu.something.new');
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(envelope('message.failed', 'message'), { contentType: 'application/octet-stream' });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed the same way but sent with svix-* headers', async () => {
    const res = await send(envelope('message.delivered', 'message'), { prefix: 'svix' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type: 'message.delivered' });
  });

  test('rejects an invalid signature sent with svix-* headers', async () => {
    const res = await send(envelope('message.delivered', 'message'), { prefix: 'svix', signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = envelope('workflow.published', 'workflow');
    const msgId = 'msg_rotation';
    const timestamp = now();
    const signature = `v1,aW52YWxpZF9zaWduYXR1cmU= ${sign(payload, msgId, timestamp)}`;
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(200);
  });

  test('ignores signature versions other than v1', async () => {
    const payload = envelope('workflow.published', 'workflow');
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
    const res = await send(envelope('message.failed', 'message'), { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = envelope('message.failed', 'message');
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign(envelope('message.failed', 'message'), msgId, timestamp);
    const res = await send(envelope('message.sent', 'message'), { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send(envelope('message.failed', 'message'), { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.NOVU_WEBHOOK_SECRET;
    const res = await send(envelope('message.failed', 'message'));
    expect(res.status).toBe(500);
  });
});
