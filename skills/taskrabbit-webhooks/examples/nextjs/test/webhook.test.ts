import { describe, test, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/taskrabbit/route';
import { NextRequest } from 'next/server';

// Svix-style secret: 'whsec_' + base64 key. base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

const PROJECT_UUID = '550e8400-e29b-41d4-a716-446655440000';

// Example payloads from Taskrabbit's webhook docs
const PAYLOADS: Record<string, Record<string, string>> = {
  'project.completed': {
    event: 'project.completed',
    project_uuid: PROJECT_UUID,
    timestamp: '2025-01-22T10:00:00Z',
    agreement_external_reference: 'REF-12345',
  },
  'project.canceled': {
    event: 'project.canceled',
    project_uuid: PROJECT_UUID,
    cancellation_reason: 'order_canceled',
    timestamp: '2025-01-22T10:00:00Z',
    agreement_external_reference: 'REF-12345',
  },
  'project.rescheduled': {
    event: 'project.rescheduled',
    project_uuid: PROJECT_UUID,
    new_start_time: '2025-06-15T09:15:00Z',
    previous_start_time: '2025-06-15T07:00:00Z',
    timestamp: '2025-06-15T09:15:00Z',
    agreement_external_reference: 'REF-12345',
  },
};

// Generate a valid Svix signature: HMAC-SHA256 over "<id>.<timestamp>.<raw body>",
// keyed with the base64-decoded bytes after "whsec_", base64-encoded, prefixed "v1,".
function generateSignature(payload: string, secret: string, timestamp: string, msgId: string): string {
  const key = Buffer.from(secret.split('_')[1], 'base64');
  const signature = crypto
    .createHmac('sha256', key)
    .update(`${msgId}.${timestamp}.${payload}`)
    .digest('base64');
  return `v1,${signature}`;
}

function signedHeaders(payload: string, timestamp?: string): Record<string, string> {
  const ts = timestamp ?? Math.floor(Date.now() / 1000).toString();
  const id = 'msg_' + crypto.randomBytes(12).toString('hex');
  return {
    'svix-id': id,
    'svix-timestamp': ts,
    'svix-signature': generateSignature(payload, TEST_SECRET, ts, id),
  };
}

function makeRequest(payload: string, headers: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/taskrabbit', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: payload,
  });
}

describe('Taskrabbit Webhook Handler', () => {
  beforeAll(() => {
    process.env.TASKRABBIT_WEBHOOK_SECRET = TEST_SECRET;
  });

  test('accepts a valid project.completed webhook', async () => {
    const payload = JSON.stringify(PAYLOADS['project.completed']);
    const response = await POST(makeRequest(payload, signedHeaders(payload)));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, event: 'project.completed' });
  });

  test.each(Object.keys(PAYLOADS))('handles %s', async (eventName) => {
    const payload = JSON.stringify(PAYLOADS[eventName]);
    const response = await POST(makeRequest(payload, signedHeaders(payload)));

    expect(response.status).toBe(200);
    expect((await response.json()).event).toBe(eventName);
  });

  test('accepts webhook-* header aliases', async () => {
    const payload = JSON.stringify(PAYLOADS['project.canceled']);
    const h = signedHeaders(payload);
    const response = await POST(
      makeRequest(payload, {
        'webhook-id': h['svix-id'],
        'webhook-timestamp': h['svix-timestamp'],
        'webhook-signature': h['svix-signature'],
      })
    );

    expect(response.status).toBe(200);
  });

  test('accepts when any of multiple signatures matches (secret rotation)', async () => {
    const payload = JSON.stringify(PAYLOADS['project.rescheduled']);
    const h = signedHeaders(payload);
    h['svix-signature'] = `v1,aW52YWxpZF9zaWduYXR1cmU= ${h['svix-signature']}`;
    const response = await POST(makeRequest(payload, h));

    expect(response.status).toBe(200);
  });

  test('rejects missing headers', async () => {
    const payload = JSON.stringify(PAYLOADS['project.completed']);
    const response = await POST(makeRequest(payload, {}));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('Missing required');
  });

  test('rejects an invalid signature', async () => {
    const payload = JSON.stringify(PAYLOADS['project.completed']);
    const h = signedHeaders(payload);
    h['svix-signature'] = 'v1,aW52YWxpZF9zaWduYXR1cmU=';
    const response = await POST(makeRequest(payload, h));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Invalid signature');
  });

  test('rejects a tampered body', async () => {
    const payload = JSON.stringify(PAYLOADS['project.completed']);
    const tampered = payload.replace('REF-12345', 'REF-99999');
    const response = await POST(makeRequest(tampered, signedHeaders(payload)));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Invalid signature');
  });

  test('rejects an old timestamp', async () => {
    const payload = JSON.stringify(PAYLOADS['project.completed']);
    const oldTimestamp = (Math.floor(Date.now() / 1000) - 600).toString();
    const response = await POST(makeRequest(payload, signedHeaders(payload, oldTimestamp)));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Timestamp too old');
  });

  test('handles unknown events gracefully', async () => {
    const payload = JSON.stringify({
      event: 'project.some_new_event',
      project_uuid: PROJECT_UUID,
      timestamp: '2025-01-22T10:00:00Z',
    });
    const response = await POST(makeRequest(payload, signedHeaders(payload)));

    expect(response.status).toBe(200);
    expect((await response.json()).event).toBe('project.some_new_event');
  });
});
