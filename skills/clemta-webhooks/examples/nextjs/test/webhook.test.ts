import crypto from 'crypto';
import { beforeEach, describe, expect, test } from 'vitest';
import { POST } from '../app/webhooks/clemta/route';

// Standard Webhooks secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Algorithm: base64(HMAC-SHA256(decoded secret, `${id}.${timestamp}.${body}`))
function sign(payload: string, msgId: string, timestamp: string, secret = TEST_SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${signature}`;
}

const now = () => Math.floor(Date.now() / 1000).toString();

function send(
  payload: string,
  opts: {
    msgId?: string;
    timestamp?: string;
    signature?: string;
    headers?: Record<string, string>;
    contentType?: string;
    prefix?: 'svix' | 'webhook';
  } = {}
) {
  const msgId = opts.msgId ?? `evt_${crypto.randomBytes(12).toString('hex')}`;
  const timestamp = opts.timestamp ?? now();
  const prefix = opts.prefix ?? 'webhook';
  const headers: Record<string, string> = opts.headers ?? {
    [`${prefix}-id`]: msgId,
    [`${prefix}-timestamp`]: timestamp,
    [`${prefix}-signature`]: opts.signature ?? sign(payload, msgId, timestamp),
  };
  return POST(
    new Request('http://localhost:3000/webhooks/clemta', {
      method: 'POST',
      headers: { 'content-type': opts.contentType ?? 'application/json', ...headers },
      body: payload,
    })
  );
}

const eventTypes = [
  'company.created', 'company.status.changed', 'company.verified', 'company.incorporated',
  'company.onboarding.completed', 'company.name.changed', 'company.ein.assigned',
  'company.document.received', 'company.entitlements.changed', 'company.updated', 'company.dissolved',
  'tax_filing.created', 'tax_filing.status.changed',
  'service_order.status.changed', 'service_order.completed', 'service_order.updated',
  'service_order.quoted', 'service_order.renewal_canceled', 'service_order.renewal_cancel_denied',
  'requirement.created', 'requirement.fulfilled', 'requirement.canceled',
  'requirement.signature.viewed', 'requirement.signature.signed',
  'file.created', 'calendar.reminder', 'invoice.finalized',
];

const body = (type: string) =>
  JSON.stringify({ type, data: { object: { object: type.split('.')[0], id: 'cmp_123', status: 'active' } } });

describe('Clemta webhook handler', () => {
  beforeEach(() => {
    process.env.CLEMTA_WEBHOOK_SECRET = TEST_SECRET;
  });

  test.each(eventTypes)('handles %s', async (type) => {
    const res = await send(body(type));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type });
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(body('company.something_new'));
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('company.something_new');
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(body('company.created'), { contentType: 'application/octet-stream' });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed the same way but sent with svix-* headers', async () => {
    const res = await send(body('company.created'), { prefix: 'svix' });
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('company.created');
  });

  test('accepts any matching v1 signature among several (secret rotation)', async () => {
    const payload = body('company.created');
    const msgId = 'evt_rotation';
    const timestamp = now();
    const signature = `v1,aW52YWxpZF9zaWduYXR1cmU= ${sign(payload, msgId, timestamp)}`;
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(200);
  });

  test('skips the v1a (Ed25519) entry that Clemta sends beside v1', async () => {
    const payload = body('company.created');
    const msgId = 'evt_v1a';
    const timestamp = now();
    const signature = `${sign(payload, msgId, timestamp)} v1a,${Buffer.alloc(64, 1).toString('base64')}`;
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(200);
  });

  test('rejects a delivery that carries only a v1a signature', async () => {
    const payload = body('company.created');
    const msgId = 'evt_v1a_only';
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
    const res = await send(body('company.created'), { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = body('company.created');
    const msgId = 'evt_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'evt_tamper';
    const timestamp = now();
    const signature = sign(body('company.dissolved'), msgId, timestamp);
    const res = await send(body('company.created'), { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send(body('company.created'), { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.CLEMTA_WEBHOOK_SECRET;
    const res = await send(body('company.created'));
    expect(res.status).toBe(500);
  });
});
