import crypto from 'crypto';
import { beforeEach, describe, expect, test } from 'vitest';
import { POST } from '../app/webhooks/propelauth/route';

// PropelAuth (Svix) secrets are 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Same algorithm Svix uses: base64(HMAC-SHA256(decoded secret, `${id}.${timestamp}.${body}`))
function sign(payload: string, msgId: string, timestamp: string, secret = TEST_SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${signature}`;
}

const now = () => Math.floor(Date.now() / 1000).toString();

function send(
  payload: string,
  opts: { msgId?: string; timestamp?: string; signature?: string; headers?: Record<string, string>; contentType?: string } = {}
) {
  const msgId = opts.msgId ?? `msg_${crypto.randomBytes(12).toString('hex')}`;
  const timestamp = opts.timestamp ?? now();
  const headers = opts.headers ?? {
    'svix-id': msgId,
    'svix-timestamp': timestamp,
    'svix-signature': opts.signature ?? sign(payload, msgId, timestamp),
  };
  return POST(
    new Request('http://localhost:3000/webhooks/propelauth', {
      method: 'POST',
      headers: { 'content-type': opts.contentType ?? 'application/json', ...headers },
      body: payload,
    })
  );
}

describe('PropelAuth webhook handler', () => {
  beforeEach(() => {
    process.env.PROPELAUTH_WEBHOOK_SECRET = TEST_SECRET;
  });

  test.each([
    ['user.created', { user_id: 'u_1', email: 'a@example.com' }],
    ['user.updated', { user_id: 'u_1' }],
    ['user.deleted', { user_id: 'u_1' }],
    ['org.created', { org_id: 'o_1', name: 'Acme' }],
    ['user.added_to_org', { user_id: 'u_1', org_id: 'o_1' }],
  ])('handles %s', async (type, data) => {
    const res = await send(JSON.stringify({ event_type: type, ...data }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type });
  });

  test('falls back to a `type` field', async () => {
    const res = await send(JSON.stringify({ type: 'user.created', user_id: 'u_1' }));
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('user.created');
  });

  test('verifies whatever content type the request uses', async () => {
    const res = await send(JSON.stringify({ event_type: 'user.created', user_id: 'u_1' }), { contentType: 'text/plain' });
    expect(res.status).toBe(200);
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(JSON.stringify({ event_type: 'user.login', user_id: 'u_1' }));
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('user.login');
  });

  test('accepts any matching signature among several', async () => {
    const payload = JSON.stringify({ event_type: 'user.created', user_id: 'u_1' });
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
    const res = await send('{"event_type":"user.created"}', { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = '{"event_type":"user.created"}';
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign('{"event_type":"user.created","user_id":"u_1"}', msgId, timestamp);
    const res = await send('{"event_type":"user.created","user_id":"u_2"}', { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send('{"event_type":"user.created"}', { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Timestamp too old');
  });

  test('rejects a validly signed body that is not JSON', async () => {
    const res = await send('not json');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid JSON');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.PROPELAUTH_WEBHOOK_SECRET;
    const res = await send('{"event_type":"user.created"}');
    expect(res.status).toBe(500);
  });
});
