// Generated with: relay-messenger-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/relay-messenger/route';

// Relay secrets are Standard Webhooks secrets: "whsec_" + base64(key bytes), for
// example "whsec_cmVsYXktdGVzdC1zaWduaW5nLWtleS0wMTIzNDU2Nzg5YQ==". The HMAC key is
// the decoded part.
const SECRET = 'whsec_' + Buffer.from('relay-test-signing-key-0123456789a').toString('base64');

/** Sign exactly like Relay does: HMAC-SHA256 over `${id}.${timestamp}.${body}`. */
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
  prefix?: 'webhook' | 'svix';
  id?: string;
  timestamp?: number | string;
  secret?: string;
  signature?: string;
}

/** Build signature headers. `prefix` is 'webhook' (Relay) or 'svix' (fallback). */
function signedHeaders(rawBody: string, opts: SignOptions = {}): Record<string, string> {
  const prefix = opts.prefix ?? 'webhook';
  const id = opts.id || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(opts.timestamp ?? now());
  return {
    'content-type': 'application/json',
    [`${prefix}-id`]: id,
    [`${prefix}-timestamp`]: ts,
    [`${prefix}-signature`]: opts.signature ?? sign(rawBody, id, ts, opts.secret),
  };
}

function post(rawBody: string, headers: Record<string, string>) {
  return POST(
    new Request('http://localhost:3000/webhooks/relay-messenger', {
      method: 'POST',
      headers,
      body: rawBody,
    })
  );
}

const envelope = (eventType: string, data: Record<string, unknown>, eventId: string = crypto.randomUUID()) => ({
  api_version: 'v1',
  webhook_version: '2026-08-30',
  event_type: eventType,
  event_id: eventId,
  created_at: '2026-02-05T19:31:13.736Z',
  trace_id: '8af9171a45022df2eb74ba4e4c83be0f',
  agent_id: '01a05223-bd8e-7619-8a44-b7e2069a226f',
  data,
});

const handle = { id: '01a082e5-e880-73f9-9333-8e650dee9cac', handle: 'alex', kind: 'user', display_name: 'Alex', is_me: false, status: 'active' };

const messageReceived = (eventId?: string) =>
  envelope(
    'message.received',
    {
      chat_id: '8f392755-6865-4b18-880a-227f9d8b458f',
      id: '89e3566e-1d13-49e5-a8ee-48490d5bfeb7',
      direction: 'inbound',
      from: 'alex',
      from_handle: handle,
      is_from_me: false,
      parts: [{ type: 'text', value: 'Hello!' }],
      sent_at: '2026-10-04T20:37:57.254Z',
    },
    eventId
  );

describe('Relay webhook route', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.RELAY_MESSENGER_WEBHOOK_SECRET = SECRET;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    process.env.RELAY_MESSENGER_WEBHOOK_SECRET = SECRET;
  });

  describe('signature verification', () => {
    it('accepts a validly signed delivery with webhook-* headers', async () => {
      const raw = JSON.stringify(messageReceived());
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts the same delivery sent with svix-* headers', async () => {
      const raw = JSON.stringify(messageReceived());
      const res = await post(raw, signedHeaders(raw, { prefix: 'svix' }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('prefers webhook-* headers when both sets are present', async () => {
      const raw = JSON.stringify(messageReceived());
      const res = await post(raw, {
        ...signedHeaders(raw),
        'svix-id': 'msg_other',
        'svix-timestamp': String(now()),
        'svix-signature': 'v1,AAAA',
      });
      expect(res.status).toBe(200);
    });

    it('verifies the exact bytes, whatever the content type', async () => {
      const raw = '{"api_version":"v1",  "event_type":"message.sent","event_id":"e-1",\n"data":{"id":"m1","chat_id":"c1"}}';
      const res = await post(raw, { ...signedHeaders(raw), 'content-type': 'text/plain' });
      expect(res.status).toBe(200);
    });

    it('accepts a delivery signed with several signatures when one is valid', async () => {
      const raw = JSON.stringify(messageReceived());
      const id = 'msg_multi';
      const ts = String(now());
      const bad = sign(raw, id, ts, 'whsec_' + Buffer.from('some-other-secret-value-0123456').toString('base64'));
      const res = await post(raw, signedHeaders(raw, { id, timestamp: ts, signature: `${bad} ${sign(raw, id, ts)}` }));
      expect(res.status).toBe(200);
    });

    it('ignores non-v1 signature entries', async () => {
      const raw = JSON.stringify(messageReceived());
      const id = 'msg_v1a';
      const ts = String(now());
      const res = await post(raw, signedHeaders(raw, { id, timestamp: ts, signature: sign(raw, id, ts).replace('v1,', 'v1a,') }));
      expect(res.status).toBe(400);
    });

    it('rejects a tampered body', async () => {
      const raw = JSON.stringify(messageReceived());
      const headers = signedHeaders(raw);
      const res = await post(raw.replace('Hello!', 'Hacked'), headers);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid signature' });
    });

    it('rejects a signature made with another secret', async () => {
      const raw = JSON.stringify(messageReceived());
      const other = 'whsec_' + Buffer.from('another-subscription-secret-01').toString('base64');
      const res = await post(raw, signedHeaders(raw, { secret: other }));
      expect(res.status).toBe(400);
    });

    it('rejects a stale timestamp', async () => {
      const raw = JSON.stringify(messageReceived());
      const res = await post(raw, signedHeaders(raw, { timestamp: now() - 6 * 60 }));
      expect(res.status).toBe(400);
    });

    it('rejects a timestamp too far in the future', async () => {
      const raw = JSON.stringify(messageReceived());
      const res = await post(raw, signedHeaders(raw, { timestamp: now() + 6 * 60 }));
      expect(res.status).toBe(400);
    });

    it.each(['id', 'timestamp', 'signature'])('rejects a delivery missing webhook-%s', async (name) => {
      const raw = JSON.stringify(messageReceived());
      const headers = signedHeaders(raw);
      delete headers[`webhook-${name}`];
      const res = await post(raw, headers);
      expect(res.status).toBe(400);
    });

    it('rejects a delivery with no signature headers', async () => {
      const raw = JSON.stringify(messageReceived());
      const res = await post(raw, { 'content-type': 'application/json' });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Missing signature headers' });
    });

    it('fails closed when the secret is not configured', async () => {
      delete process.env.RELAY_MESSENGER_WEBHOOK_SECRET;
      const raw = JSON.stringify(messageReceived());
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Webhook secret not configured' });
    });
  });

  describe('event handling', () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ['message.received', { id: 'm1', chat_id: 'c1', from_handle: handle }],
      ['message.sent', { id: 'm2', chat_id: 'c1' }],
      ['message.delivered', { id: 'm2', chat_id: 'c1' }],
      ['message.read', { id: 'm2', chat_id: 'c1' }],
      ['message.failed', { chat_id: 'c1', message_id: 'm3', code: 3006, detail_code: 401, reason: 'HTTP 401' }],
      ['reaction.added', { chat_id: 'c1', message_id: 'm2', part_index: 0, reaction_type: 'love', from_handle: handle }],
      ['reaction.removed', { chat_id: 'c1', message_id: 'm2', part_index: 0, reaction_type: 'love', from_handle: handle }],
      ['chat.created', { id: 'c1', is_group: false }],
      ['participant.added', { chat_id: 'c1', participant: handle }],
      ['participant.removed', { chat_id: 'c1', participant: handle }],
    ];

    it.each(cases)('handles %s', async (type, data) => {
      const raw = JSON.stringify(envelope(type, data));
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
      expect(logSpy.mock.calls.flat().join('\n')).not.toContain('Unhandled');
    });

    it('acknowledges event types it does not handle', async () => {
      const raw = JSON.stringify(envelope('call.created', { call: { id: 'call1', status: 'ringing' } }));
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Unhandled Relay event type: call.created');
    });

    it('acknowledges a retried event_id as a duplicate, even with a new webhook-id', async () => {
      const raw = JSON.stringify(messageReceived('evt-dedupe-1'));
      const first = await post(raw, signedHeaders(raw));
      expect(await first.json()).toEqual({ received: true });

      const retry = await post(raw, signedHeaders(raw));
      expect(retry.status).toBe(200);
      expect(await retry.json()).toEqual({ received: true, duplicate: true });
    });
  });
});
