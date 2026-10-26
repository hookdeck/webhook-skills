// Generated with: axilio-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/axilio/route';

// Axilio secrets are "whsec_" + base64(key bytes).
// The HMAC key is the base64-DECODED part after "whsec_".
const SECRET = 'whsec_' + Buffer.from('axilio-test-signing-key-01234567').toString('base64');

/** Sign exactly like Axilio (Standard Webhooks). */
function sign(rawBody: string, id: string, timestamp: string, secret = SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`, 'utf8')
    .digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);

interface SignOptions {
  id?: string;
  timestamp?: number | string;
  secret?: string;
  signature?: string;
  contentType?: string;
}

function signedHeaders(rawBody: string, opts: SignOptions = {}): Record<string, string> {
  const id = opts.id || JSON.parse(rawBody).id;
  const ts = String(opts.timestamp ?? now());
  return {
    'content-type': opts.contentType || 'application/json',
    'webhook-id': id,
    'webhook-timestamp': ts,
    'webhook-signature': opts.signature ?? sign(rawBody, id, ts, opts.secret),
  };
}

function post(rawBody: string, headers: Record<string, string>) {
  return POST(
    new Request('http://localhost:3000/webhooks/axilio', {
      method: 'POST',
      headers,
      body: rawBody,
    })
  );
}

const RESOURCE = '0199a3c2-58c1-7f3a-9f2e-2f9a6a2f6a11';

function event(
  type: string,
  data: Record<string, unknown> = {},
  opts: { test?: boolean; id?: string } = {}
) {
  return {
    id: opts.id || `${type}:${crypto.randomUUID()}`,
    type,
    occurred_at: '2026-09-24T12:00:45Z',
    test: opts.test ?? false,
    data,
  };
}

const runCompleted = () =>
  event('run.completed', {
    id: RESOURCE,
    workflow_id: '0199a3c2-58c1-7f3a-9f2e-2f9a6a2f6a22',
    status: 'completed',
    trigger: 'api',
    success: true,
  });

const ALL_TYPES = [
  'run.started',
  'run.completed',
  'run.failed',
  'run.cancelled',
  'session.started',
  'session.ended',
  'session.recording_ready',
  'balance.low',
  'balance.depleted',
  'balance.recovered',
  'invoice.paid',
  'invoice.payment_failed',
  'subscription.updated',
  'subscription.canceled',
  'auto_recharge.succeeded',
  'auto_recharge.failed',
  'file.ready',
  'file.capture_failed',
  'file.delivered',
  'file.delivery_failed',
  'phone.maintenance_started',
  'phone.maintenance_ended',
  'phone.offline',
  'phone.online',
  'phone.rental.activated',
  'phone.rental.past_due',
  'phone.rental.canceled',
  'webhook.test',
];

beforeEach(() => {
  process.env.AXILIO_WEBHOOK_SECRET = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('valid signatures', () => {
  it.each(ALL_TYPES)('accepts %s', async (type) => {
    const body = JSON.stringify(event(type));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled'));
  });

  it('logs the run id for run.completed', async () => {
    const body = JSON.stringify(runCompleted());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(`Run ${RESOURCE} completed`);
  });

  it('reports the cancellation reason for run.cancelled', async () => {
    const body = JSON.stringify(event('run.cancelled', { id: RESOURCE, reason: 'queue_timeout' }));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(`Run ${RESOURCE} cancelled (queue_timeout)`);
  });

  it('acknowledges dashboard test deliveries without acting on them', async () => {
    const body = JSON.stringify(event('run.failed', { id: RESOURCE }, { test: true }));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith('Test delivery received: run.failed');
    expect(console.log).not.toHaveBeenCalledWith(`Run ${RESOURCE} failed`);
  });

  it('acknowledges unknown event types with 200', async () => {
    const body = JSON.stringify(event('run.something_new'));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith('Unhandled Axilio event type: run.something_new');
  });

  it.each(['text/plain', 'application/octet-stream', 'application/vnd.axilio+json'])(
    'verifies the raw bytes for content type %s',
    async (contentType) => {
      const body = JSON.stringify(runCompleted());
      const res = await post(body, signedHeaders(body, { contentType }));
      expect(res.status).toBe(200);
    }
  );

  it('verifies a body with non-ASCII characters byte for byte', async () => {
    const body = JSON.stringify(event('phone.online', { phone_id: 'k3Vq8ZrT2mXa', phone_name: 'Pixel é 日本' }));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('accepts when any one of several space-separated signatures matches', async () => {
    const body = JSON.stringify(runCompleted());
    const headers = signedHeaders(body);
    headers['webhook-signature'] = `v1,bm90LXRoZS1yaWdodC1zaWc= ${headers['webhook-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('returns 200 for redeliveries of the same event id', async () => {
    const body = JSON.stringify(runCompleted());
    const first = await post(body, signedHeaders(body));
    const second = await post(body, signedHeaders(body));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ received: true, duplicate: true });
  });
});

describe('invalid requests', () => {
  it('rejects missing signature headers with 400', async () => {
    const body = JSON.stringify(runCompleted());
    const res = await post(body, { 'content-type': 'application/json' });
    expect(res.status).toBe(400);
  });

  it('rejects an empty body', async () => {
    const res = await post('', {
      'webhook-id': 'x',
      'webhook-timestamp': String(now()),
      'webhook-signature': 'v1,aW52YWxpZA==',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a bad signature', async () => {
    const body = JSON.stringify(runCompleted());
    const res = await post(body, signedHeaders(body, { signature: 'v1,aW52YWxpZA==' }));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with a different secret', async () => {
    const other = 'whsec_' + Buffer.from('some-other-secret-key-0123456789').toString('base64');
    const body = JSON.stringify(runCompleted());
    const res = await post(body, signedHeaders(body, { secret: other }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(runCompleted());
    const headers = signedHeaders(body);
    const res = await post(body.replace('completed', 'failed'), headers);
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp outside the library 5-minute tolerance', async () => {
    const body = JSON.stringify(runCompleted());
    const res = await post(body, signedHeaders(body, { timestamp: now() - 600 }));
    expect(res.status).toBe(400);
  });

  it('rejects signatures keyed with the undecoded secret string', async () => {
    const body = JSON.stringify(runCompleted());
    const id = JSON.parse(body).id;
    const ts = String(now());
    const wrong = crypto
      .createHmac('sha256', SECRET.slice('whsec_'.length))
      .update(`${id}.${ts}.${body}`)
      .digest('base64');
    const res = await post(body, signedHeaders(body, { id, timestamp: ts, signature: `v1,${wrong}` }));
    expect(res.status).toBe(400);
  });
});

describe('fail closed', () => {
  it('returns 500 when AXILIO_WEBHOOK_SECRET is not set', async () => {
    delete process.env.AXILIO_WEBHOOK_SECRET;
    const body = JSON.stringify(runCompleted());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
  });
});
