import crypto from 'crypto';
import { beforeEach, describe, expect, test } from 'vitest';
import { POST } from '../app/webhooks/pipecat-cloud/route';

// Svix-format secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Svix algorithm: base64(HMAC-SHA256(decoded secret, `${id}.${timestamp}.${body}`))
function sign(payload: string, msgId: string, timestamp: string, secret = TEST_SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${signature}`;
}

const now = () => Math.floor(Date.now() / 1000).toString();

// prefix: 'svix' (Pipecat Cloud) or 'webhook' (Standard Webhooks names for the same values)
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
    new Request('http://localhost:3000/webhooks/pipecat-cloud', {
      method: 'POST',
      headers: { 'content-type': opts.contentType ?? 'application/json', ...headers },
      body: payload,
    })
  );
}

const events: Record<string, Record<string, unknown>> = {
  'build.started': { build_id: '9f1c3a52', region: 'us-west-2', status: 'building', triggered_by: 'github', commit_sha: null, ref: null, repo_full_name: null },
  'build.succeeded': { build_id: '9f1c3a52', region: 'us-west-2', status: 'success', triggered_by: 'github', image_uri: '123456789012.dkr.ecr.us-west-2.amazonaws.com/acme-co/voice-agent:e3b0c44', build_duration_seconds: 94 },
  'build.failed': { build_id: '9f1c3a52', status: 'failed', error_message: 'Dockerfile not found', build_duration_seconds: 12 },
  'build.timeout': { build_id: '9f1c3a52', status: 'timeout', error_message: 'Build timed out', build_duration_seconds: 3600 },
  'deployment.created': { deployment_id: 'd1f7b2c8', service_id: '2a8e5c17', service_name: 'voice-agent', region: 'us-west-2', build_id: null },
  'deployment.updated': { deployment_id: 'd1f7b2c8', service_id: '2a8e5c17', service_name: 'voice-agent', region: 'us-west-2', build_id: '9f1c3a52' },
  'service.suspended': { service_id: '2a8e5c17', service_name: 'voice-agent', region: 'us-west-2', reason: 'trial_exhausted' },
  'service.resumed': { service_id: '2a8e5c17', service_name: 'voice-agent', region: 'us-west-2' },
  'spend.threshold_reached': { percent: 80, current_spend_cents: 8000, limit_cents: 10000 },
  'spend.limit_reached': { current_spend_cents: 10000, limit_cents: 10000 },
  'spend.limit_cleared': { previous_limit_cents: 10000 },
  'session.started': { session_id: 'b4d9e017', service: 'voice-agent', transport: 'daily', region: 'us-west-2' },
  'org.trial_started': { org_name: 'acme-co', trial_credits_cents: 5000 },
  'org.trial_ended': { org_name: 'acme-co', amount_due_cents: 1200 },
  'api_key.created': { key_id: 'key_01', name: 'ci', type: 'private', actor_user_id: null },
  'api_key.rotated': { key_id: 'key_01', name: 'ci', type: 'private', actor_user_id: 'user_2mK9' },
  'api_key.deleted': { key_id: 'key_01', name: null, type: 'public', actor_user_id: 'user_2mK9' },
  'secret.created': { set_name: 'voice-agent-secrets', region: 'us-west-2', type: 'secret', scope: 'set', actor_user_id: 'user_2mK9' },
  'secret.updated': { set_name: 'voice-agent-secrets', region: 'us-west-2', type: 'secret', scope: 'field', actor_user_id: 'user_2mK9', field_names: ["OPENAI_API_KEY"] },
  'secret.deleted': { set_name: 'voice-agent-secrets', region: 'us-west-2', type: 'imagePullSecret', scope: 'set', actor_user_id: null },
};

describe('Pipecat Cloud webhook handler', () => {
  beforeEach(() => {
    process.env.PIPECAT_CLOUD_WEBHOOK_SECRET = TEST_SECRET;
  });

  test.each(Object.entries(events))('handles %s', async (type, data) => {
    const res = await send(JSON.stringify({ event_type: type, org: 'acme-co', created_at: '2026-08-25T11:40:32.000Z', data }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type });
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(JSON.stringify({ event_type: 'pipecat_cloud.something.new' }));
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('pipecat_cloud.something.new');
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(JSON.stringify({ event_type: 'build.succeeded', data: { build_id: '9f1c3a52' } }), {
      contentType: 'application/octet-stream',
    });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed the same way but sent with webhook-* headers', async () => {
    const res = await send(JSON.stringify({ event_type: 'build.succeeded', data: { build_id: '9f1c3a52' } }), { prefix: 'webhook' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type: 'build.succeeded' });
  });

  test('rejects an invalid signature sent with webhook-* headers', async () => {
    const res = await send('{"event_type":"build.succeeded"}', { prefix: 'webhook', signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = JSON.stringify({ event_type: 'build.succeeded' });
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
    const res = await send('{"event_type":"build.succeeded"}', { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = '{"event_type":"build.succeeded"}';
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign('{"event_type":"build.failed"}', msgId, timestamp);
    const res = await send('{"event_type":"build.succeeded"}', { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send('{"event_type":"build.succeeded"}', { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.PIPECAT_CLOUD_WEBHOOK_SECRET;
    const res = await send('{"event_type":"build.succeeded"}');
    expect(res.status).toBe(500);
  });
});
