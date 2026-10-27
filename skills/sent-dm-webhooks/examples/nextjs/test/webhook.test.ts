// Generated with: sent-dm-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/sent-dm/route';

// Sent secrets look like "whsec_" + base64(key bytes). The HMAC key is the decoded part.
const SECRET = 'whsec_' + Buffer.from('sent-test-signing-key-0123456789').toString('base64');
const WEBHOOK_ID = '4f0f7a3e-9dad-11d1-80b4-00c04fd430c8'; // the webhook's id, constant across events


/** Sign exactly like Sent: v1,base64(HMAC-SHA256(key, "{id}.{ts}.{body}")). */
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
  eventId?: string;
  timestamp?: number | string;
  secret?: string;
  signature?: string;
  contentType?: string;
}

function signedHeaders(
  rawBody: string,
  { id, eventId, timestamp, secret, signature, contentType }: SignOptions = {}
): Record<string, string> {
  const hookId = id || WEBHOOK_ID;
  const ts = String(timestamp ?? now());
  return {
    'content-type': contentType || 'application/json',
    'x-webhook-id': hookId,
    'x-webhook-event-id': eventId || crypto.randomUUID(),
    'x-webhook-timestamp': ts,
    'x-webhook-attempt': '1',
    'x-webhook-signature': signature ?? sign(rawBody, hookId, ts, secret),
  };
}

function post(rawBody: string, headers: Record<string, string>) {
  return POST(
    new Request('http://localhost:3000/webhooks/sent-dm', {
      method: 'POST',
      headers,
      body: rawBody,
    })
  );
}

// Payloads follow Sent's documented examples (docs.sent.dm/start/webhooks/event-types).
const messageDelivered = () => ({
  field: 'message',
  event: 'message.delivered',
  timestamp: '2025-10-31T10:10:42Z',
  payload: {
    updated_at: '2025-10-31T10:10:41Z',
    account_id: '7ba7b820-9dad-11d1-80b4-00c04fd430c8',
    message_id: '8ba7b830-9dad-11d1-80b4-00c04fd430c8',
    template_id: '9ba7b840-9dad-11d1-80b4-00c04fd430c8',
    template_name: 'order_confirmation',
    outbound_number: '+1987654321',
    agent_id: 'agent_abc123',
    message_status: 'DELIVERED',
    channel: 'sms',
    body: 'Hi Jane, your order has been confirmed.',
  },
});

const messageFailed = () => ({
  field: 'message',
  event: 'message.failed',
  timestamp: '2025-10-31T12:15:42Z',
  payload: {
    updated_at: '2025-10-31T12:15:42Z',
    account_id: '7ba7b820-9dad-11d1-80b4-00c04fd430c8',
    message_id: '8ba7b830-9dad-11d1-80b4-00c04fd430c8',
    template_id: '9ba7b840-9dad-11d1-80b4-00c04fd430c8',
    outbound_number: '+1987654321',
    message_status: 'FAILED',
    channel: 'sms',
    body: 'Hi Jane, your order has been confirmed.',
    reason_code: 'DELIVERY_013',
    reason: 'The carrier rejected the message',
  },
});

const messageReceived = () => ({
  field: 'message',
  event: 'message.received',
  timestamp: '2025-10-31T10:10:42Z',
  payload: {
    message_id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    updated_at: '2025-10-31T10:10:40Z',
    account_id: '7ba7b820-9dad-11d1-80b4-00c04fd430c8',
    inbound_number: '+1234567890',
    outbound_number: '+1987654321',
    text: 'Hello, I have a question about my order',
    channel: 'sms',
    received_at: '2025-10-31T10:10:40Z',
  },
});

const templateApproved = () => ({
  field: 'templates',
  event: 'templates.approved',
  timestamp: '2025-10-31T12:18:14Z',
  payload: {
    account_id: '7ba7b820-9dad-11d1-80b4-00c04fd430c8',
    template_id: '9ba7b840-9dad-11d1-80b4-00c04fd430c8',
    template_name: 'order_confirmation',
    whatsapp_template_id: '1234567890123456',
    status: 'APPROVED',
    language: 'en_US',
    category: 'UTILITY',
    channel: 'whatsapp',
  },
});

const contactOptOut = () => ({
  field: 'contact',
  event: 'contact.opt_out',
  timestamp: '2026-09-24T14:00:00Z',
  request_id: 'req_9Y0aLq3kEx',
  payload: {
    account_id: '7ba7b820-9dad-11d1-80b4-00c04fd430c8',
    contact_id: 'a1b2c3d4-9dad-11d1-80b4-00c04fd430c8',
    from: '+14155551234',
    to: '+18005550100',
    opt_out: true,
    source: 'INBOUND_KEYWORD',
    channel: 'sms',
    text: 'STOP',
    message_id: '8ba7b830-9dad-11d1-80b4-00c04fd430c8',
  },
});

const channelActivated = () => ({
  field: 'channel',
  event: 'channel.activated',
  timestamp: '2025-10-31T14:22:09Z',
  request_id: 'req_7X9zKp2jDw',
  payload: {
    channel: 'sms',
    status: 'ACTIVE',
    account_id: '7ba7b820-9dad-11d1-80b4-00c04fd430c8',
    country: 'XK',
    number_type: 'ALPHANUMERIC',
    sender_value: 'SENTDM',
    updated_at: '2025-10-31T14:22:09Z',
  },
});

beforeEach(() => {
  process.env.SENT_WEBHOOK_SECRET = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('valid signatures', () => {
  const cases: [string, () => unknown, string][] = [
    ['message.delivered', messageDelivered, 'Message delivered'],
    ['message.failed', messageFailed, 'Message failed'],
    ['message.received', messageReceived, 'Inbound message from +1234567890'],
    ['templates.approved', templateApproved, 'Template order_confirmation APPROVED'],
    ['contact.opt_out', contactOptOut, 'Contact opted out'],
    ['channel.activated', channelActivated, 'Channel activated'],
  ];

  it.each(cases)('accepts %s', async (_name: string, build: () => unknown, logged: string) => {
    const body = JSON.stringify(build());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining(logged));
  });

  it('acknowledges unhandled event types with 200', async () => {
    const body = JSON.stringify({ field: 'link', event: 'link.clicked', timestamp: '2025-10-31T15:04:02Z', payload: {} });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Unhandled Sent event: link.clicked'));
  });

  it('verifies whatever Content-Type the request carries', async () => {
    const body = JSON.stringify(messageDelivered());
    const res = await post(body, signedHeaders(body, { contentType: 'text/plain' }));
    expect(res.status).toBe(200);
  });

  it('accepts when any one of several space-delimited signatures matches', async () => {
    const body = JSON.stringify(messageDelivered());
    const headers = signedHeaders(body);
    headers['x-webhook-signature'] = `v1,bm90LXRoZS1yaWdodC1zaWc= ${headers['x-webhook-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('dedupes retries on X-Webhook-Event-ID, not X-Webhook-ID', async () => {
    const body = JSON.stringify(messageDelivered());
    const eventId = crypto.randomUUID();
    const first = await post(body, signedHeaders(body, { eventId }));
    const retry = await post(body, signedHeaders(body, { eventId }));
    const other = await post(body, signedHeaders(body)); // same X-Webhook-ID, new event
    expect(await first.json()).toEqual({ received: true });
    expect(await retry.json()).toEqual({ received: true, duplicate: true });
    expect(await other.json()).toEqual({ received: true });
  });
});

describe('invalid requests', () => {
  it('rejects missing signature headers with 400', async () => {
    const body = JSON.stringify(messageDelivered());
    const res = await post(body, { 'content-type': 'application/json' });
    expect(res.status).toBe(400);
  });

  it('rejects a bad signature with 401', async () => {
    const body = JSON.stringify(messageDelivered());
    const res = await post(body, signedHeaders(body, { signature: 'v1,aW52YWxpZA==' }));
    expect(res.status).toBe(401);
  });

  it("rejects a signature made with another webhook's secret", async () => {
    const other = 'whsec_' + Buffer.from('another-webhook-secret-012345678').toString('base64');
    const body = JSON.stringify(messageDelivered());
    const res = await post(body, signedHeaders(body, { secret: other }));
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(messageDelivered());
    const headers = signedHeaders(body);
    const res = await post(body.replace('+1987654321', '+1000000000'), headers);
    expect(res.status).toBe(401);
  });

  it('rejects a signature that does not cover X-Webhook-ID', async () => {
    const body = JSON.stringify(messageDelivered());
    const ts = String(now());
    const res = await post(body, signedHeaders(body, { timestamp: ts, signature: sign(body, 'some-other-id', ts) }));
    expect(res.status).toBe(401);
  });

  it('rejects a timestamp outside the 5-minute tolerance', async () => {
    const body = JSON.stringify(messageDelivered());
    const res = await post(body, signedHeaders(body, { timestamp: now() - 600 }));
    expect(res.status).toBe(401);
  });

  it('rejects signatures keyed with the undecoded secret string', async () => {
    const body = JSON.stringify(messageDelivered());
    const ts = String(now());
    const wrong = crypto
      .createHmac('sha256', SECRET.slice('whsec_'.length))
      .update(`${WEBHOOK_ID}.${ts}.${body}`)
      .digest('base64');
    const res = await post(body, signedHeaders(body, { timestamp: ts, signature: `v1,${wrong}` }));
    expect(res.status).toBe(401);
  });
});

describe('fail closed', () => {
  it('returns 503 when SENT_WEBHOOK_SECRET is not set', async () => {
    delete process.env.SENT_WEBHOOK_SECRET;
    const body = JSON.stringify(messageDelivered());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(503);
  });
});
