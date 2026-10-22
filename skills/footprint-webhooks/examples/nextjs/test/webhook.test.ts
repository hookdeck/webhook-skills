import crypto from 'crypto';
import { beforeEach, describe, expect, test } from 'vitest';
import { POST } from '../app/webhooks/footprint/route';

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
    new Request('http://localhost:3000/webhooks/footprint', {
      method: 'POST',
      headers: { 'content-type': opts.contentType ?? 'application/json', ...headers },
      body: payload,
    })
  );
}

const events: Record<string, Record<string, unknown>> = {
  'footprint.onboarding.completed': { fp_id: 'fp_id_xyz', is_live: false, onboarding_id: 'ob_SRFT2a1mN7DAWJ0VPXkiqK', requires_manual_review: false, status: 'pass' },
  'footprint.onboarding.incomplete': { fp_id: 'fp_id_xyz', is_live: false, onboarding_id: 'ob_SRFT2a1mN7DAWJ0VPXkiqK' },
  'footprint.onboarding.status_changed': { fp_id: 'fp_id_xyz', is_live: false, new_status: 'pass', requires_manual_review: false },
  'footprint.watchlist_check.completed': { error: null, fp_id: 'fp_id_xyz', onboarding_id: 'ob_SRFT2a1mN7DAWJ0VPXkiqK', status: 'pending' },
  'footprint.user.manual_review': { fp_id: 'fp_id_xyz', is_live: false },
  'footprint.user.info_requested': { fp_id: 'fp_id_xyz', is_live: false },
  'footprint.user.bank_link_updated': { fp_id: 'fp_id_xyz', link_id: 'bank_link_abcd1234', link_state: 'connected' },
  'footprint.vault.updated': { fp_id: 'fp_id_xyz', fields: ['id.ssn9', 'id.first_name'], source: 'dashboard' },
  'footprint.entity.entity_status_set': { entity_kind: 'person', fp_id: 'fp_id_xyz', status: { kind: 'verification_status', value: 'verified' } },
};

describe('Footprint webhook handler', () => {
  beforeEach(() => {
    process.env.FOOTPRINT_WEBHOOK_SECRET = TEST_SECRET;
  });

  test.each(Object.entries(events))('handles %s', async (type, data) => {
    const res = await send(JSON.stringify({ event_kind: type, timestamp: '2024-06-14T02:40:00Z', ...data }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type });
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(JSON.stringify({ event_kind: 'footprint.something.new' }));
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('footprint.something.new');
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(JSON.stringify({ event_kind: 'footprint.user.manual_review', fp_id: 'fp_id_xyz' }), {
      contentType: 'application/octet-stream',
    });
    expect(res.status).toBe(200);
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = JSON.stringify({ event_kind: 'footprint.onboarding.completed' });
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
    const res = await send('{"event_kind":"footprint.onboarding.completed"}', { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = '{"event_kind":"footprint.onboarding.completed"}';
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign('{"event_kind":"footprint.onboarding.completed","status":"fail"}', msgId, timestamp);
    const res = await send('{"event_kind":"footprint.onboarding.completed","status":"pass"}', { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send('{"event_kind":"footprint.onboarding.completed"}', { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.FOOTPRINT_WEBHOOK_SECRET;
    const res = await send('{"event_kind":"footprint.onboarding.completed"}');
    expect(res.status).toBe(500);
  });
});
