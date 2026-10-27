import crypto from 'crypto';
import { beforeEach, describe, expect, test } from 'vitest';
import { POST } from '../app/webhooks/hexclave/route';

// Svix-format secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Svix algorithm: base64(HMAC-SHA256(decoded secret, `${id}.${timestamp}.${body}`))
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
  const msgId = opts.msgId ?? `msg_${crypto.randomBytes(12).toString('hex')}`;
  const timestamp = opts.timestamp ?? now();
  const prefix = opts.prefix ?? 'svix';
  const headers: Record<string, string> = opts.headers ?? {
    [`${prefix}-id`]: msgId,
    [`${prefix}-timestamp`]: timestamp,
    [`${prefix}-signature`]: opts.signature ?? sign(payload, msgId, timestamp),
  };
  return POST(
    new Request('http://localhost:3000/webhooks/hexclave', {
      method: 'POST',
      headers: { 'content-type': opts.contentType ?? 'application/json', ...headers },
      body: payload,
    })
  );
}

const bodies: Record<string, Record<string, unknown>> = {
  'user.created': { id: '3a1f0c2e-5b7d-4e1a-9c3f-1d2e4f6a8b0c', display_name: 'Ada' },
  'user.updated': { id: '3a1f0c2e-5b7d-4e1a-9c3f-1d2e4f6a8b0c', display_name: 'Ada L.' },
  'user.deleted': { id: '3a1f0c2e-5b7d-4e1a-9c3f-1d2e4f6a8b0c' },
  'team.created': { id: '2209422a-eef7-4668-967d-be79409972c5', display_name: 'My Team' },
  'team.updated': { id: '2209422a-eef7-4668-967d-be79409972c5', display_name: 'Renamed Team' },
  'team.deleted': { id: '2209422a-eef7-4668-967d-be79409972c5' },
  'team_membership.created': { team_id: '2209422a-eef7-4668-967d-be79409972c5', user_id: '3a1f0c2e-5b7d-4e1a-9c3f-1d2e4f6a8b0c' },
  'team_membership.deleted': { team_id: '2209422a-eef7-4668-967d-be79409972c5', user_id: '3a1f0c2e-5b7d-4e1a-9c3f-1d2e4f6a8b0c' },
  'team_permission.created': { team_id: '2209422a-eef7-4668-967d-be79409972c5', id: 'team_member' },
  'team_permission.deleted': { team_id: '2209422a-eef7-4668-967d-be79409972c5', id: 'team_member' },
};

const envelope = (type = 'team.created') => JSON.stringify({ type, data: bodies[type] ?? { id: 'x' } });

describe('Hexclave webhook handler', () => {
  beforeEach(() => {
    process.env.HEXCLAVE_WEBHOOK_SECRET = TEST_SECRET;
  });

  test.each(Object.keys(bodies))('handles %s', async (type) => {
    const res = await send(envelope(type));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type });
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(JSON.stringify({ type: 'user.something_new', data: {} }));
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('user.something_new');
  });

  test('accepts a verified body without a type field', async () => {
    const res = await send(JSON.stringify({ data: {} }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type: null });
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(envelope(), { contentType: 'application/octet-stream' });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed the same way but sent with webhook-* headers', async () => {
    const res = await send(envelope('user.created'), { prefix: 'webhook' });
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('user.created');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = envelope();
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
    const res = await send(envelope(), { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = envelope();
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign(envelope('team.deleted'), msgId, timestamp);
    const res = await send(envelope('team.created'), { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('ignores signature versions other than v1', async () => {
    const payload = envelope();
    const msgId = 'msg_v1a';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp).replace('v1,', 'v1a,');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send(envelope(), { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Timestamp too old');
  });

  test('rejects a verified body that is not a JSON object', async () => {
    const res = await send('null');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid JSON');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.HEXCLAVE_WEBHOOK_SECRET;
    const res = await send(envelope());
    expect(res.status).toBe(500);
  });
});
