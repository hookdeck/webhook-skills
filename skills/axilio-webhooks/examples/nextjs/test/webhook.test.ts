// Generated with: axilio-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../app/webhooks/axilio/route';

// Axilio secrets look like "whsec_" + base64(key bytes). The HMAC key is the decoded part.
const SECRET = 'whsec_' + Buffer.from('axilio-test-signing-key-0123456789').toString('base64');
const OTHER_SECRET = 'whsec_' + Buffer.from('another-destination-key-000000').toString('base64');

const EVENT_TYPES = [
  'run.started', 'run.completed', 'run.failed', 'run.cancelled',
  'session.started', 'session.ended', 'session.recording_ready',
  'balance.low', 'balance.depleted', 'balance.recovered',
  'invoice.paid', 'invoice.payment_failed',
  'subscription.updated', 'subscription.canceled',
  'auto_recharge.succeeded', 'auto_recharge.failed',
  'file.ready', 'file.capture_failed', 'file.delivered', 'file.delivery_failed',
  'phone.maintenance_started', 'phone.maintenance_ended', 'phone.offline', 'phone.online',
  'phone.rental.activated', 'phone.rental.past_due', 'phone.rental.canceled',
  'webhook.test',
];

/** Sign exactly like Axilio does: Standard Webhooks, HMAC-SHA256, base64. */
function sign(rawBody: string, id: string, timestamp: string | number, secret = SECRET) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`, 'utf8')
    .digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);

function signedHeaders(rawBody: string, { id, timestamp, secret, signature, prefix = 'webhook' }: Record<string, any> = {}): Record<string, string> {
  const msgId = id || `run.completed:${crypto.randomUUID()}`;
  const ts = String(timestamp ?? now());
  return {
    'content-type': 'application/json',
    [`${prefix}-id`]: msgId,
    [`${prefix}-timestamp`]: ts,
    [`${prefix}-signature`]: signature ?? sign(rawBody, msgId, ts, secret),
  };
}

function post(rawBody: string, headers: Record<string, string>) {
  return POST(new Request('http://localhost/webhooks/axilio', { method: 'POST', headers, body: rawBody }));
}

const event = (type: string, data: Record<string, any> = {}, id = `${type}:0199a3c2-58c1-7f3a-9f2e-2f9a6a2f6a11`) => ({
  id,
  type,
  occurred_at: '2026-09-24T12:00:45Z',
  test: false,
  data,
});

const runCompleted = () =>
  event('run.completed', {
    id: '0199a3c2-58c1-7f3a-9f2e-2f9a6a2f6a11',
    workflow_id: '0199a3c2-58c1-7f3a-9f2e-2f9a6a2f6a22',
    device_class: 'phone',
    phone_id: 'k3Vq8ZrT2mXa',
    session_id: '0199a3c2-58c1-7f3a-9f2e-2f9a6a2f6a33',
    status: 'completed',
    trigger: 'api',
    started_at: '2026-09-24T12:00:00Z',
    completed_at: '2026-09-24T12:00:45Z',
    success: true,
    created_at: '2026-09-24T11:59:57Z',
  });

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  process.env.AXILIO_WEBHOOK_SECRET = SECRET;
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

const logged = (text: string) => logSpy.mock.calls.some((c) => String(c[0]).includes(text));

describe('valid signatures', () => {
  it('accepts run.completed and logs the run', async () => {
    const body = JSON.stringify(runCompleted());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(logged('run.completed: run 0199a3c2')).toBe(true);
  });

  it.each(EVENT_TYPES)('accepts %s', async (type) => {
    const body = JSON.stringify(event(type));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(logged('Unhandled')).toBe(false);
  });

  it('logs unknown event types as unhandled but still returns 200', async () => {
    const body = JSON.stringify(event('run.paused'));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(logged('Unhandled Axilio event type: run.paused')).toBe(true);
  });

  it('verifies the raw body whatever the content type is', async () => {
    const body = JSON.stringify(runCompleted());
    const res = await post(body, { ...signedHeaders(body), 'content-type': 'text/plain' });
    expect(res.status).toBe(200);
  });

  it('verifies a body with unusual whitespace byte for byte', async () => {
    const body = JSON.stringify(runCompleted(), null, 4);
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('accepts a dashboard test flagged test: true', async () => {
    const body = JSON.stringify({ ...event('webhook.test', { message: 'This is a test event from Axilio.' }), test: true });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('accepts when any space-separated v1 entry matches', async () => {
    const body = JSON.stringify(runCompleted());
    const id = 'run.completed:multi';
    const ts = String(now());
    const signature = `${sign(body, id, ts, OTHER_SECRET)} ${sign(body, id, ts)}`;
    const res = await post(body, signedHeaders(body, { id, timestamp: ts, signature }));
    expect(res.status).toBe(200);
  });

  it('ignores non-v1 entries such as v1a', async () => {
    const body = JSON.stringify(runCompleted());
    const id = 'run.completed:v1a';
    const ts = String(now());
    const good = sign(body, id, ts);
    const v1a = good.replace('v1,', 'v1a,');
    const only = await post(body, signedHeaders(body, { id, timestamp: ts, signature: v1a }));
    expect(only.status).toBe(400);
    const both = await post(body, signedHeaders(body, { id, timestamp: ts, signature: `${v1a} ${good}` }));
    expect(both.status).toBe(200);
  });

  it('falls back to svix-* headers when webhook-id is absent', async () => {
    const body = JSON.stringify(runCompleted());
    const res = await post(body, signedHeaders(body, { prefix: 'svix' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });
});

describe('invalid requests', () => {
  it('rejects a tampered body', async () => {
    const body = JSON.stringify(runCompleted());
    const headers = signedHeaders(body);
    const res = await post(body.replace('completed', 'failed'), headers);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid signature' });
  });

  it("rejects another destination's secret", async () => {
    const body = JSON.stringify(runCompleted());
    const res = await post(body, signedHeaders(body, { secret: OTHER_SECRET }));
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp older than 5 minutes', async () => {
    const body = JSON.stringify(runCompleted());
    const res = await post(body, signedHeaders(body, { timestamp: now() - 600 }));
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp too far in the future', async () => {
    const body = JSON.stringify(runCompleted());
    const res = await post(body, signedHeaders(body, { timestamp: now() + 600 }));
    expect(res.status).toBe(400);
  });

  it('rejects a garbage signature', async () => {
    const body = JSON.stringify(runCompleted());
    const res = await post(body, signedHeaders(body, { signature: 'v1,not-a-real-signature' }));
    expect(res.status).toBe(400);
  });

  it('rejects missing headers', async () => {
    const body = JSON.stringify(runCompleted());
    const res = await post(body, { 'content-type': 'application/json' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing signature headers' });
  });

  it('rejects when only some headers are present', async () => {
    const body = JSON.stringify(runCompleted());
    const headers = signedHeaders(body);
    delete headers['webhook-signature'];
    const res = await post(body, headers);
    expect(res.status).toBe(400);
  });
});

describe('fail closed', () => {
  it('returns 500 and never processes when the secret is unset', async () => {
    delete process.env.AXILIO_WEBHOOK_SECRET;
    const body = JSON.stringify(runCompleted());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
    expect(logged('run.completed:')).toBe(false);
  });
});

describe('at-least-once delivery', () => {
  it('acknowledges a retried delivery as a duplicate without reprocessing', async () => {
    const body = JSON.stringify(runCompleted());
    const id = `run.completed:${crypto.randomUUID()}`;
    const first = await post(body, signedHeaders(body, { id }));
    expect(await first.json()).toEqual({ received: true });
    logSpy.mockClear();

    const retry = await post(body, signedHeaders(body, { id }));
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ received: true, duplicate: true });
    expect(logSpy).not.toHaveBeenCalled();
  });
});
