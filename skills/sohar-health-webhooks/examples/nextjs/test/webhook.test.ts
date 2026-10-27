import crypto from 'crypto';
import { beforeEach, describe, expect, test } from 'vitest';
import { POST } from '../app/webhooks/sohar-health/route';

// Svix-format secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Svix algorithm: base64(HMAC-SHA256(decoded secret, `${id}.${timestamp}.${body}`))
function sign(payload: string, msgId: string, timestamp: string, secret = TEST_SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${signature}`;
}

const now = () => Math.floor(Date.now() / 1000).toString();

// prefix: 'svix' (Sohar Health as documented) or 'webhook' (Standard Webhooks names for the same values)
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
    new Request('http://localhost:3000/webhooks/sohar-health', {
      method: 'POST',
      headers: { 'content-type': opts.contentType ?? 'application/json', ...headers },
      body: payload,
    })
  );
}

// Sohar Health's bodies are flat: `event` plus the resource id, `id` and `status` (documented examples)
function body(event: string, extra: Record<string, unknown> = {}): string {
  const base: Record<string, unknown> = event.includes('flow.callback')
    ? { event, flowRunId: '990cdad8-1438-4bbd-8b55-120b56e87540', input: { type: 'object', properties: { memberId: { type: 'string' } } } }
    : event.includes('flow.')
      ? { event, flowRunId: '990cdad8-1438-4bbd-8b55-120b56e87540', flowId: '33093874-1e3d-4ea9-b988-8cc64e5a4079', status: 'COMPLETE', stateId: 'create-verification' }
      : event.includes('discovery.')
        ? { event, discoveryId: 'fb701ac1-1246-4860-b1ec-bd916b97a990', status: 'complete', id: '123456' }
        : { event, verificationId: '990cdad8-1438-4bbd-8b55-120b56e87540', id: '123456', status: event.includes('pending') ? 'pending' : 'complete.eligible' };
  return JSON.stringify({ ...base, ...extra });
}

// The 10 documented event types
const EVENTS = [
  'verification.updated', 'sandbox.verification.updated',
  'verification.pending', 'sandbox.verification.pending',
  'discovery.updated', 'sandbox.discovery.updated',
  'flow.updated', 'sandbox.flow.updated',
  'flow.callback', 'sandbox.flow.callback',
];

describe('Sohar Health webhook handler', () => {
  beforeEach(() => {
    process.env.SOHAR_HEALTH_WEBHOOK_SECRET = TEST_SECRET;
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

  test('handles a body without an event field', async () => {
    const res = await send('{}');
    expect(res.status).toBe(200);
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(body('verification.updated'), { contentType: 'application/octet-stream' });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed the same way but sent with webhook-* headers', async () => {
    const res = await send(body('verification.updated'), { prefix: 'webhook' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, event: 'verification.updated' });
  });

  test('rejects an invalid signature sent with webhook-* headers', async () => {
    const res = await send(body('verification.updated'), { prefix: 'webhook', signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = body('flow.updated');
    const msgId = 'msg_rotation';
    const timestamp = now();
    const signature = `v1,aW52YWxpZF9zaWduYXR1cmU= ${sign(payload, msgId, timestamp)}`;
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(200);
  });

  test('ignores signature versions other than v1', async () => {
    const payload = body('flow.updated');
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
    const res = await send(body('verification.updated'), { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = body('verification.updated');
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign(body('verification.pending'), msgId, timestamp);
    const res = await send(body('verification.updated'), { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send(body('verification.updated'), { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.SOHAR_HEALTH_WEBHOOK_SECRET;
    const res = await send(body('verification.updated'));
    expect(res.status).toBe(500);
  });
});
