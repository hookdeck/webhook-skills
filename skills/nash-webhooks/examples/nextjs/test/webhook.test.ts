import crypto from 'crypto';
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { POST } from '../app/webhooks/nash/route';

// Svix signing secrets are 'whsec_' + base64(key).
// base64 of "test_secret_key_for_nash_webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvcl9uYXNoX3dlYmhvb2tz';

// Sign exactly as Svix does for Nash:
// base64(HMAC-SHA256(base64decode(secret without whsec_), "{id}.{timestamp}.{body}"))
function sign(body: string, secret: string, msgId: string, timestamp: string): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${body}`).digest('base64');
  return `v1,${sig}`;
}

interface Overrides {
  secret?: string;
  timestamp?: string;
  signature?: string;
}

function signedRequest(body: string, o: Overrides = {}, sendBody = body): Request {
  const msgId = `msg_${crypto.randomBytes(12).toString('hex')}`;
  const timestamp = o.timestamp ?? Math.floor(Date.now() / 1000).toString();
  return new Request('http://localhost:3000/webhooks/nash', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'svix-id': msgId,
      'svix-timestamp': timestamp,
      'svix-signature': o.signature ?? sign(body, o.secret ?? TEST_SECRET, msgId, timestamp),
    },
    body: sendBody,
  });
}

const taskCreated = JSON.stringify({
  type: 'task',
  event: 'created',
  data: { id: 'job_R7FXJrfB99bpvpzf6CriJC', isBatch: false, jobConfigurations: [] },
});

describe('Nash webhook route', () => {
  beforeEach(() => {
    process.env.NASH_WEBHOOK_SECRET = TEST_SECRET;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  test('accepts a correctly signed webhook', async () => {
    const res = await POST(signedRequest(taskCreated));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, type: 'task.created' });
  });

  test('accepts when one of several signatures matches (rotation)', async () => {
    const req = signedRequest(taskCreated);
    const headers = new Headers(req.headers);
    headers.set('svix-signature', `v1,${Buffer.from('nope').toString('base64')} ${headers.get('svix-signature')}`);
    const res = await POST(new Request(req.url, { method: 'POST', headers, body: taskCreated }));
    expect(res.status).toBe(200);
  });

  test('rejects missing Svix headers', async () => {
    const res = await POST(
      new Request('http://localhost:3000/webhooks/nash', { method: 'POST', body: taskCreated })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Missing Svix signature headers');
  });

  test('rejects an invalid signature', async () => {
    const res = await POST(signedRequest(taskCreated, { signature: 'v1,aW52YWxpZA==' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const res = await POST(signedRequest(taskCreated, { secret: 'whsec_b3RoZXJfc2VjcmV0X2tleQ==' }));
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const res = await POST(signedRequest(taskCreated, {}, taskCreated.replace('created', 'failed')));
    expect(res.status).toBe(400);
  });

  test('rejects a stale timestamp (older than 5 minutes)', async () => {
    const old = (Math.floor(Date.now() / 1000) - 600).toString();
    const res = await POST(signedRequest(taskCreated, { timestamp: old }));
    expect(res.status).toBe(400);
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.NASH_WEBHOOK_SECRET;
    const res = await POST(signedRequest(taskCreated));
    expect(res.status).toBe(500);
  });

  test.each([
    ['delivery', 'created'],
    ['delivery', 'assigned_driver'],
    ['delivery', 'dropoff_complete'],
    ['delivery', 'canceled_by_provider'],
    ['delivery', 'failed'],
    ['task', 'created'],
    ['task', 'canceled_by_provider'],
    ['task', 'failed'],
    ['courier_location', 'updated'],
    ['courier_name', 'updated'],
    ['shift', 'dispatched'],
    ['task', 'refund_created'],
  ])('handles %s.%s', async (type, event) => {
    const body = JSON.stringify({ type, event, data: { id: 'job_123' } });
    const res = await POST(signedRequest(body));
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe(`${type}.${event}`);
  });
});
