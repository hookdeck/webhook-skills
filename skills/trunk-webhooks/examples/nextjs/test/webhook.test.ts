import crypto from 'crypto';
import { beforeEach, describe, expect, test } from 'vitest';
import { POST } from '../app/webhooks/trunk/route';

// Svix-format secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Svix algorithm: base64(HMAC-SHA256(decoded secret, `${id}.${timestamp}.${body}`))
function sign(payload: string, msgId: string, timestamp: string, secret = TEST_SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${signature}`;
}

const now = () => Math.floor(Date.now() / 1000).toString();

// prefix: 'svix' (Trunk) or 'webhook' (Standard Webhooks names for the same values)
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
    new Request('http://localhost:3000/webhooks/trunk', {
      method: 'POST',
      headers: { 'content-type': opts.contentType ?? 'application/json', ...headers },
      body: payload,
    })
  );
}

const events: Record<string, Record<string, unknown>> = {
  'pull_request.queued': {"action": "queued", "status": "QUEUED", "pr_number": 1234, "repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}},
  'pull_request.submitted': {"action": "submitted", "status": "SUBMITTED", "pr_number": 1234, "repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}},
  'pull_request.testing': {"action": "testing", "status": "TESTING", "pr_number": 1234, "repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}},
  'pull_request.pending_failure': {"action": "pending_failure", "status": "PENDING_FAILURE", "pr_number": 1234, "repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}},
  'pull_request.failed': {"action": "failed", "status": "FAILED", "pr_number": 1234, "repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}},
  'pull_request.canceled': {"action": "canceled", "status": "CANCELED", "pr_number": 1234, "repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}},
  'pull_request.merged': {"action": "merged", "status": "MERGED", "pr_number": 1234, "repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}},
  'pull_request_batch.queued': {"action": "queued", "status": "QUEUED", "repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}},
  'pull_request_batch.submitted': {"action": "submitted", "status": "SUBMITTED", "repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}},
  'pull_request_batch.testing': {"action": "testing", "status": "TESTING", "repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}},
  'pull_request_batch.pending_failure': {"action": "pending_failure", "status": "PENDING_FAILURE", "repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}},
  'pull_request_batch.failed': {"action": "failed", "status": "FAILED", "repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}},
  'pull_request_batch.canceled': {"action": "canceled", "status": "CANCELED", "repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}},
  'pull_request_batch.merged': {"action": "merged", "status": "MERGED", "repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}},
  'test_case.status_changed': {"previous_status": "HEALTHY", "new_status": "FLAKY", "repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}, "test_case": {"id": "7c1d9e52-84b3-4f6a-a0d5-3e9b2c4f1a68", "name": "checkout flow", "classname": "CheckoutTest", "file_path": "tests/checkout.test.ts", "html_url": "https://app.trunk.io/acme-co/flaky-tests/test/7c1d9e52", "codeowners": ["@acme-co/web"], "quarantined": false, "variant": ""}},
  'v2.test_case.status_changed': {"previous_status": "HEALTHY", "new_status": "FLAKY", "triggered_by": {"monitor_id": "0e6b1a9c-5d27-4c83-8f14-b7a2d9c3e508", "monitor_type": "pass_on_retry", "monitor_status": "active"}, "repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}, "test_case": {"id": "7c1d9e52-84b3-4f6a-a0d5-3e9b2c4f1a68", "name": "checkout flow", "classname": "CheckoutTest", "file_path": "tests/checkout.test.ts", "html_url": "https://app.trunk.io/acme-co/flaky-tests/test/7c1d9e52", "codeowners": ["@acme-co/web"], "quarantined": false, "variant": ""}},
  'test_case.monitor_status_changed': {"monitor": {"id": "0e6b1a9c-5d27-4c83-8f14-b7a2d9c3e508", "type": "pass_on_retry", "status": "active"}, "evidence": {}, "repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}, "test_case": {"id": "7c1d9e52-84b3-4f6a-a0d5-3e9b2c4f1a68", "name": "checkout flow", "classname": "CheckoutTest", "file_path": "tests/checkout.test.ts", "html_url": "https://app.trunk.io/acme-co/flaky-tests/test/7c1d9e52", "codeowners": ["@acme-co/web"], "quarantined": false, "variant": ""}},
  'test_case.quarantining_setting_changed': {"repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}, "test_case": {"id": "7c1d9e52-84b3-4f6a-a0d5-3e9b2c4f1a68", "name": "checkout flow", "classname": "CheckoutTest", "file_path": "tests/checkout.test.ts", "html_url": "https://app.trunk.io/acme-co/flaky-tests/test/7c1d9e52", "codeowners": ["@acme-co/web"], "quarantined": false, "variant": ""}},
  'v2.test_case.quarantining_setting_changed': {"repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}, "test_case": {"id": "7c1d9e52-84b3-4f6a-a0d5-3e9b2c4f1a68", "name": "checkout flow", "classname": "CheckoutTest", "file_path": "tests/checkout.test.ts", "html_url": "https://app.trunk.io/acme-co/flaky-tests/test/7c1d9e52", "codeowners": ["@acme-co/web"], "quarantined": false, "variant": ""}},
  'test_case.investigation_completed': {"investigation_id": "c3a7f1d0-9b42-4e68-8d15-2f6e0a9b4c71", "trigger": "AUTOMATIC", "confidence": 0.82, "created_at": "2026-08-25T11:40:32.000Z", "markdown_summary": "The test races with a seeded fixture.", "failure_message": "expected 200, got 500", "facts": [{"fact_type": "GIT_BLAME", "content": "Last changed in a1b2c3d", "confidence": 0.9}], "repository": {"id": "5b8f4c3e-2a71-4d0e-9a3b-6c1f0d2e7a14", "html_url": "https://github.com/acme-co/web"}, "test_case": {"id": "7c1d9e52-84b3-4f6a-a0d5-3e9b2c4f1a68", "name": "checkout flow", "classname": "CheckoutTest", "file_path": "tests/checkout.test.ts", "html_url": "https://app.trunk.io/acme-co/flaky-tests/test/7c1d9e52", "codeowners": ["@acme-co/web"], "quarantined": false, "variant": ""}},
};

describe('Trunk webhook handler', () => {
  beforeEach(() => {
    process.env.TRUNK_WEBHOOK_SECRET = TEST_SECRET;
  });

  test.each(Object.entries(events))('handles %s', async (type, fields) => {
    const res = await send(JSON.stringify({ type, timestamp: '2026-08-25T11:40:32.000Z', ...fields }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type });
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(JSON.stringify({ type: 'pull_request.something_new' }));
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('pull_request.something_new');
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(JSON.stringify({ type: 'pull_request.merged', pr_number: 1234 }), {
      contentType: 'application/octet-stream',
    });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed the same way but sent with webhook-* headers', async () => {
    const res = await send(JSON.stringify({ type: 'pull_request.merged', pr_number: 1234 }), { prefix: 'webhook' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type: 'pull_request.merged' });
  });

  test('rejects an invalid signature sent with webhook-* headers', async () => {
    const res = await send('{"type":"pull_request.merged"}', { prefix: 'webhook', signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = JSON.stringify({ type: 'pull_request.merged' });
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
    const res = await send('{"type":"pull_request.merged"}', { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = '{"type":"pull_request.merged"}';
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign('{"type":"pull_request.failed"}', msgId, timestamp);
    const res = await send('{"type":"pull_request.merged"}', { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send('{"type":"pull_request.merged"}', { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.TRUNK_WEBHOOK_SECRET;
    const res = await send('{"type":"pull_request.merged"}');
    expect(res.status).toBe(500);
  });
});
