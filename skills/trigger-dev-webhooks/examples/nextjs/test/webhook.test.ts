import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const secret = 'test_trigger_dev_alert_secret';
const HEADER = 'x-trigger-signature-hmacsha256';

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.TRIGGER_DEV_WEBHOOK_SECRET = secret;
  ({ POST } = await import('../app/webhooks/trigger-dev/route'));
});

// Bare hex HMAC-SHA256 of the raw body, keyed with the secret as UTF-8
function sign(payload: string, key: string = secret): string {
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

function makeRequest(body: string, signature?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature) headers[HEADER] = signature;
  return new NextRequest('http://localhost:3000/webhooks/trigger-dev', {
    method: 'POST',
    headers,
    body,
  });
}

const base = { id: 'evt_1', created: '2026-01-01T00:00:00.000Z', webhookVersion: '2025-01-01' };

const events: Record<string, object> = {
  'alert.run.failed': {
    ...base,
    type: 'alert.run.failed',
    object: { task: { id: 'my-task' }, run: { id: 'run_1' } },
  },
  'alert.deployment.success': {
    ...base,
    type: 'alert.deployment.success',
    object: { deployment: { version: '20260101.1' } },
  },
  'alert.deployment.failed': {
    ...base,
    type: 'alert.deployment.failed',
    object: { deployment: { version: '20260101.2' }, error: { name: 'BuildError', message: 'boom' } },
  },
  'alert.error': {
    ...base,
    type: 'alert.error',
    object: { classification: 'new_issue', error: { fingerprint: 'abc', message: 'oops' } },
  },
};

describe('POST /webhooks/trigger-dev', () => {
  it('returns 400 for a missing signature', async () => {
    const res = await POST(makeRequest(JSON.stringify(events['alert.run.failed'])));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Missing signature header');
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await POST(makeRequest(JSON.stringify(events['alert.run.failed']), 'a'.repeat(64)));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  it('returns 400 for a signature made with a different secret', async () => {
    const payload = JSON.stringify(events['alert.run.failed']);
    const res = await POST(makeRequest(payload, sign(payload, 'other_secret')));
    expect(res.status).toBe(400);
  });

  it('returns 400 when the body is modified after signing', async () => {
    const payload = JSON.stringify(events['alert.run.failed']);
    const res = await POST(makeRequest(payload + ' ', sign(payload)));
    expect(res.status).toBe(400);
  });

  it.each(Object.keys(events))('handles %s', async (type) => {
    const payload = JSON.stringify(events[type]);
    const res = await POST(makeRequest(payload, sign(payload)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies regardless of content type', async () => {
    const payload = JSON.stringify(events['alert.deployment.success']);
    const res = await POST(makeRequest(payload, sign(payload), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('acknowledges unknown event types', async () => {
    const payload = JSON.stringify({ ...base, type: 'alert.future', object: {} });
    const res = await POST(makeRequest(payload, sign(payload)));
    expect(res.status).toBe(200);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const res = await POST(makeRequest('not json', sign('not json'), 'text/plain'));
    expect(res.status).toBe(400);
  });
});
