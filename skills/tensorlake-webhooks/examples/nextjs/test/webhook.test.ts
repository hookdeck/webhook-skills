import crypto from 'crypto';
import { beforeEach, describe, expect, test } from 'vitest';
import { POST } from '../app/webhooks/tensorlake/route';

// Svix-format secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Svix algorithm: base64(HMAC-SHA256(decoded secret, `${id}.${timestamp}.${body}`))
function sign(payload: string, msgId: string, timestamp: string, secret = TEST_SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${signature}`;
}

const now = () => Math.floor(Date.now() / 1000).toString();

// prefix: 'svix' (Tensorlake) or 'webhook' (Standard Webhooks names for the same values)
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
    new Request('http://localhost:3000/webhooks/tensorlake', {
      method: 'POST',
      headers: { 'content-type': opts.contentType ?? 'application/json', ...headers },
      body: payload,
    })
  );
}

const events: Record<string, Record<string, unknown>> = {
  'tensorlake.sandbox.created': {"previous_status": null, "sandbox": {"id": "9q2j1f4n6y8x0r3k5m7pa", "name": "build-runner", "type": "named", "image": "tensorlake/ubuntu-minimal", "generation_id": 1, "status": "pending", "outcome": null, "outcome_reason": null, "snapshot_id": null, "created_at": "2026-07-24T20:10:00Z", "resources": {"cpus": 2, "memory_mb": 4096, "disk_mb": 20480, "gpu_count": 0, "gpu_model": null}}},
  'tensorlake.sandbox.running': {"previous_status": "pending", "sandbox": {"id": "9q2j1f4n6y8x0r3k5m7pa", "name": "build-runner", "type": "named", "image": "tensorlake/ubuntu-minimal", "generation_id": 1, "status": "running", "outcome": null, "outcome_reason": null, "snapshot_id": null, "created_at": "2026-07-24T20:10:00Z", "resources": {"cpus": 2, "memory_mb": 4096, "disk_mb": 20480, "gpu_count": 0, "gpu_model": null}}},
  'tensorlake.sandbox.suspended': {"previous_status": "running", "sandbox": {"id": "9q2j1f4n6y8x0r3k5m7pa", "name": "build-runner", "type": "named", "image": "tensorlake/ubuntu-minimal", "generation_id": 1, "status": "suspended", "outcome": null, "outcome_reason": null, "snapshot_id": null, "created_at": "2026-07-24T20:10:00Z", "resources": {"cpus": 2, "memory_mb": 4096, "disk_mb": 20480, "gpu_count": 0, "gpu_model": null}}},
  'tensorlake.sandbox.resumed': {"previous_status": "suspended", "sandbox": {"id": "9q2j1f4n6y8x0r3k5m7pa", "name": "build-runner", "type": "named", "image": "tensorlake/ubuntu-minimal", "generation_id": 1, "status": "pending", "outcome": null, "outcome_reason": null, "snapshot_id": null, "created_at": "2026-07-24T20:10:00Z", "resources": {"cpus": 2, "memory_mb": 4096, "disk_mb": 20480, "gpu_count": 0, "gpu_model": null}}},
  'tensorlake.sandbox.terminated': {"previous_status": "running", "sandbox": {"id": "9q2j1f4n6y8x0r3k5m7pa", "name": "build-runner", "type": "named", "image": "tensorlake/ubuntu-minimal", "generation_id": 1, "status": "terminated", "outcome": "success", "outcome_reason": "user_terminated", "snapshot_id": null, "created_at": "2026-07-24T20:10:00Z", "resources": {"cpus": 2, "memory_mb": 4096, "disk_mb": 20480, "gpu_count": 0, "gpu_model": null}}},
  'tensorlake.sandbox.failed': {"previous_status": "running", "sandbox": {"id": "9q2j1f4n6y8x0r3k5m7pa", "name": "build-runner", "type": "named", "image": "tensorlake/ubuntu-minimal", "generation_id": 1, "status": "terminated", "outcome": "failure", "outcome_reason": "out_of_memory", "snapshot_id": null, "created_at": "2026-07-24T20:10:00Z", "resources": {"cpus": 2, "memory_mb": 4096, "disk_mb": 20480, "gpu_count": 0, "gpu_model": null}}},
  'tensorlake.application.created': {"previous_version": null, "previous_state": null, "application": {"name": "invoice-parser", "version": "2026-07-24"}},
  'tensorlake.application.updated': {"previous_version": "2026-07-23", "previous_state": "ready", "application": {"name": "invoice-parser", "version": "2026-07-24"}},
  'tensorlake.application.deleted': {"previous_version": "2026-07-24", "previous_state": "ready", "application": {"name": "invoice-parser", "version": "2026-07-24"}},
  'tensorlake.application.request.created': {"application": {"name": "invoice-parser", "version": "2026-07-24"}, "request": {"id": "req_01k0example", "status": "pending", "failure_reason": null, "created_at": "2026-07-24T21:24:35.101Z", "finished_at": null}},
  'tensorlake.application.request.completed': {"application": {"name": "invoice-parser", "version": "2026-07-24"}, "request": {"id": "req_01k0example", "status": "completed", "failure_reason": null, "created_at": "2026-07-24T21:24:35.101Z", "finished_at": "2026-07-24T21:24:37.456Z"}},
  'tensorlake.application.request.failed': {"application": {"name": "invoice-parser", "version": "2026-07-24"}, "request": {"id": "req_01k0example", "status": "failed", "failure_reason": "function_error", "created_at": "2026-07-24T21:24:35.101Z", "finished_at": "2026-07-24T21:24:37.456Z"}},
};

describe('Tensorlake webhook handler', () => {
  beforeEach(() => {
    process.env.TENSORLAKE_WEBHOOK_SECRET = TEST_SECRET;
  });

  test.each(Object.entries(events))('handles %s', async (type, data) => {
    const res = await send(JSON.stringify({ event_type: type, event_id: 'evt_019f95fb-7f33-7000-8000-000000000006', event_version: 1, occurred_at: '2026-07-24T21:15:15.123Z', project_id: 'project_123', source_id: 'src_01k0example', source_revision: '81247', source_ordinal: 0, data }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type });
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(JSON.stringify({ event_type: 'tensorlake.something.new' }));
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('tensorlake.something.new');
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(JSON.stringify({ event_type: 'tensorlake.application.request.completed', data: { request: { id: 'req_01k0example' } } }), {
      contentType: 'application/octet-stream',
    });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed the same way but sent with webhook-* headers', async () => {
    const res = await send(JSON.stringify({ event_type: 'tensorlake.application.request.completed', data: { request: { id: 'req_01k0example' } } }), { prefix: 'webhook' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type: 'tensorlake.application.request.completed' });
  });

  test('rejects an invalid signature sent with webhook-* headers', async () => {
    const res = await send('{"event_type":"tensorlake.application.request.completed"}', { prefix: 'webhook', signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = JSON.stringify({ event_type: 'tensorlake.application.request.completed' });
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
    const res = await send('{"event_type":"tensorlake.application.request.completed"}', { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = '{"event_type":"tensorlake.application.request.completed"}';
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign('{"event_type":"tensorlake.application.request.failed"}', msgId, timestamp);
    const res = await send('{"event_type":"tensorlake.application.request.completed"}', { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send('{"event_type":"tensorlake.application.request.completed"}', { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.TENSORLAKE_WEBHOOK_SECRET;
    const res = await send('{"event_type":"tensorlake.application.request.completed"}');
    expect(res.status).toBe(500);
  });
});
