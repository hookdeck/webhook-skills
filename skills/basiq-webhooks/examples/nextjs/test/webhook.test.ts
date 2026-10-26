// Generated with: basiq-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/basiq/route';

// Basiq secrets look like "whsec_" + base64(key bytes), for example
// "whsec_MA4V6bD7rB0Hcm2aw8ghgDeQ5UAak24DwnX0rX6". The HMAC key is the decoded part.
const SECRET = 'whsec_' + Buffer.from('basiq-test-signing-key-0123456789ab').toString('base64');

/** Sign the way Standard Webhooks does for Basiq deliveries. */
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
}

function signedHeaders(rawBody: string, opts: SignOptions = {}): Record<string, string> {
  const id = opts.id || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(opts.timestamp ?? now());
  return {
    'content-type': 'application/json',
    'webhook-id': id,
    'webhook-timestamp': ts,
    'webhook-signature': opts.signature ?? sign(rawBody, id, ts, opts.secret),
  };
}

function post(rawBody: string, headers: Record<string, string>) {
  return POST(
    new Request('http://localhost:3000/webhooks/basiq', {
      method: 'POST',
      headers,
      body: rawBody,
    })
  );
}

const event = (eventTypeId: string) => ({
  eventTypeId,
  eventId: 'evt-123',
  links: {
    event: 'https://au-api.basiq.io/events/evt-123',
    eventEntity: 'https://au-api.basiq.io/users/usr-456',
  },
});

const EVENT_TYPES = [
  'account.updated',
  'connection.activated',
  'connection.created',
  'connection.deleted',
  'connection.invalidated',
  'consent.created',
  'consent.expired',
  'consent.reminder',
  'consent.revoked',
  'consent.updated',
  'consent.warning',
  'transactions.updated',
  'user.created',
  'user.deleted',
  'user.updated',
];

beforeEach(() => {
  process.env.BASIQ_WEBHOOK_SECRET = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('valid signatures', () => {
  it.each(EVENT_TYPES)('accepts %s', async (type) => {
    const body = JSON.stringify(event(type));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(`${type}: https://au-api.basiq.io/users/usr-456`);
  });

  it('verifies a body sent with a non-JSON content type (raw body read)', async () => {
    const body = JSON.stringify(event('user.created'));
    const res = await post(body, { ...signedHeaders(body), 'content-type': 'text/plain' });
    expect(res.status).toBe(200);
  });

  it('acknowledges unknown event types with 200', async () => {
    const body = JSON.stringify(event('some.new.event'));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith('Unhandled Basiq event type: some.new.event');
  });

  it('accepts when any one of several space-separated signatures matches', async () => {
    const body = JSON.stringify(event('user.created'));
    const headers = signedHeaders(body);
    headers['webhook-signature'] = `v1,bm90LXRoZS1yaWdodC1zaWc= ${headers['webhook-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('returns 200 for a repeated delivery with the same webhook-id', async () => {
    const body = JSON.stringify(event('user.created'));
    const id = `msg_retry_${Date.now()}`;
    const first = await post(body, signedHeaders(body, { id }));
    const second = await post(body, signedHeaders(body, { id }));
    expect(first.status).toBe(200);
    expect(await second.json()).toEqual({ received: true, duplicate: true });
  });
});

describe('invalid requests', () => {
  it('rejects missing signature headers with 400', async () => {
    const body = JSON.stringify(event('user.created'));
    const res = await post(body, { 'content-type': 'application/json' });
    expect(res.status).toBe(400);
  });

  it('rejects a bad signature', async () => {
    const body = JSON.stringify(event('user.created'));
    const res = await post(body, signedHeaders(body, { signature: 'v1,aW52YWxpZA==' }));
    expect(res.status).toBe(400);
  });

  it("rejects a signature made with another endpoint's secret", async () => {
    const other = 'whsec_' + Buffer.from('another-endpoint-secret-01234567').toString('base64');
    const body = JSON.stringify(event('user.created'));
    const res = await post(body, signedHeaders(body, { secret: other }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(event('user.created'));
    const headers = signedHeaders(body);
    const res = await post(body.replace('usr-456', 'usr-999'), headers);
    expect(res.status).toBe(400);
  });

  it('rejects a re-serialised (pretty-printed) body', async () => {
    const body = JSON.stringify(event('user.created'));
    const headers = signedHeaders(body);
    const res = await post(JSON.stringify(JSON.parse(body), null, 2), headers);
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp outside the 5-minute window', async () => {
    const body = JSON.stringify(event('user.created'));
    const res = await post(body, signedHeaders(body, { timestamp: now() - 600 }));
    expect(res.status).toBe(400);
  });
});

describe('fail closed', () => {
  it('returns 500 when BASIQ_WEBHOOK_SECRET is not set', async () => {
    delete process.env.BASIQ_WEBHOOK_SECRET;
    const body = JSON.stringify(event('user.created'));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
  });
});
