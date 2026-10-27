// Generated with: surge-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/surge/route';

// Surge secrets are Standard Webhooks secrets: "whsec_" + base64(key bytes), for
// example "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw7Jxx2Oll+OE=". The HMAC key is
// the decoded part.
const SECRET = 'whsec_' + Buffer.from('surge-test-signing-key-0123456789').toString('base64');

/** Sign exactly like Surge does: HMAC-SHA256 over `${id}.${timestamp}.${body}`. */
function sign(rawBody: string, id: string, timestamp: string, secret = SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`, 'utf8')
    .digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);
const hex24 = () => crypto.randomBytes(12).toString('hex');

interface SignOptions {
  prefix?: 'webhook' | 'svix';
  id?: string;
  timestamp?: number | string;
  secret?: string;
  signature?: string;
}

/** Build signature headers. `prefix` is 'webhook' (Surge) or 'svix' (fallback). */
function signedHeaders(rawBody: string, opts: SignOptions = {}): Record<string, string> {
  const prefix = opts.prefix ?? 'webhook';
  const id = opts.id || hex24();
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
    new Request('http://localhost:3000/webhooks/surge', {
      method: 'POST',
      headers,
      body: rawBody,
    })
  );
}

/** Surge envelope: {id, type, timestamp, account_id, data}. */
const envelope = (
  type: string,
  data: Record<string, unknown> = { id: 'msg_01jav96823f9x9054d6gyzpp16' },
  id: string | null = 'evt_' + hex24()
) => ({
  ...(id ? { id } : {}),
  type,
  timestamp: '2024-10-21T23:29:43Z',
  account_id: 'acct_01jrz',
  data,
});

const received = (id?: string) =>
  envelope(
    'message.received',
    {
      id: 'msg_01jav96823f9x9054d6gyzpp16',
      body: 'Is the 3pm slot still available?',
      conversation: { id: 'cnv_01jav8xy7fe4nsay3c9deqxge9' },
    },
    id
  );

describe('Surge webhook route', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.SURGE_WEBHOOK_SECRET = SECRET;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    process.env.SURGE_WEBHOOK_SECRET = SECRET;
  });

  describe('signature verification', () => {
    it('accepts a validly signed delivery with webhook-* headers', async () => {
      const raw = JSON.stringify(received());
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts the same delivery sent with svix-* headers', async () => {
      const raw = JSON.stringify(received());
      const res = await post(raw, signedHeaders(raw, { prefix: 'svix' }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('prefers webhook-* headers when both sets are present', async () => {
      const raw = JSON.stringify(received());
      const res = await post(raw, {
        ...signedHeaders(raw),
        'svix-id': 'other-id',
        'svix-timestamp': String(now()),
        'svix-signature': 'v1,AAAA',
      });
      expect(res.status).toBe(200);
    });

    it('verifies the exact bytes, whatever the content type', async () => {
      const raw = '{"id":"evt_1",  "type":"message.sent",\n"timestamp":"2024-10-21T23:29:43Z","data":{"id":"msg_1"}}';
      const res = await post(raw, { ...signedHeaders(raw), 'content-type': 'text/plain' });
      expect(res.status).toBe(200);
    });

    it('accepts a delivery signed with several signatures when one is valid', async () => {
      const raw = JSON.stringify(received());
      const id = 'multi-id';
      const ts = String(now());
      const bad = sign(raw, id, ts, 'whsec_' + Buffer.from('some-other-secret-value-0123456').toString('base64'));
      const res = await post(raw, signedHeaders(raw, { id, timestamp: ts, signature: `${bad} ${sign(raw, id, ts)}` }));
      expect(res.status).toBe(200);
    });

    it('ignores non-v1 signature entries', async () => {
      const raw = JSON.stringify(received());
      const id = 'v1a-id';
      const ts = String(now());
      const res = await post(raw, signedHeaders(raw, { id, timestamp: ts, signature: sign(raw, id, ts).replace('v1,', 'v1a,') }));
      expect(res.status).toBe(400);
    });

    it('rejects a tampered body', async () => {
      const raw = JSON.stringify(received());
      const headers = signedHeaders(raw);
      const res = await post(raw.replace('Is the 3pm', 'Is the 4pm'), headers);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid signature' });
    });

    it('rejects a signature made with another secret', async () => {
      const raw = JSON.stringify(received());
      const other = 'whsec_' + Buffer.from('another-endpoint-secret-0123456').toString('base64');
      const res = await post(raw, signedHeaders(raw, { secret: other }));
      expect(res.status).toBe(400);
    });

    it('rejects a stale timestamp', async () => {
      const raw = JSON.stringify(received());
      const res = await post(raw, signedHeaders(raw, { timestamp: now() - 6 * 60 }));
      expect(res.status).toBe(400);
    });

    it('rejects a timestamp too far in the future', async () => {
      const raw = JSON.stringify(received());
      const res = await post(raw, signedHeaders(raw, { timestamp: now() + 6 * 60 }));
      expect(res.status).toBe(400);
    });

    it.each(['id', 'timestamp', 'signature'])('rejects a delivery missing webhook-%s', async (name) => {
      const raw = JSON.stringify(received());
      const headers = signedHeaders(raw);
      delete headers[`webhook-${name}`];
      const res = await post(raw, headers);
      expect(res.status).toBe(400);
    });

    it('rejects a delivery with no signature headers', async () => {
      const raw = JSON.stringify(received());
      const res = await post(raw, { 'content-type': 'application/json' });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Missing signature headers' });
    });

    it('fails closed when the secret is not configured', async () => {
      delete process.env.SURGE_WEBHOOK_SECRET;
      const raw = JSON.stringify(received());
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Webhook secret not configured' });
    });
  });

  describe('event handling', () => {
    const events = [
      'message.sent',
      'message.delivered',
      'message.failed',
      'message.received',
      'contact.opted_in',
      'contact.opted_out',
      'conversation.created',
      'campaign.approved',
      'phone_number.imported',
      'phone_number.attached_to_campaign',
      'link.followed',
      'call.ended',
      'recording.completed',
      'voicemail.received',
    ];

    it.each(events)('handles %s', async (type) => {
      const raw = JSON.stringify(envelope(type));
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
      expect(logSpy.mock.calls.flat().join('\n')).not.toContain('Unhandled');
    });

    it('logs the failure reason of message.failed', async () => {
      const raw = JSON.stringify(envelope('message.failed', { id: 'msg_9', failure_reason: 'opted_out' }));
      await post(raw, signedHeaders(raw));
      expect(logSpy).toHaveBeenCalledWith('Message failed: msg_9 (opted_out)');
    });

    it('acknowledges event types it does not handle', async () => {
      const raw = JSON.stringify(envelope('campaign.rejected'));
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Unhandled Surge event type: campaign.rejected');
    });

    it('acknowledges a retried event id as a duplicate, even with a new webhook-id', async () => {
      const raw = JSON.stringify(received('evt_dedupe_1'));
      const first = await post(raw, signedHeaders(raw));
      expect(await first.json()).toEqual({ received: true });

      const retry = await post(raw, signedHeaders(raw));
      expect(retry.status).toBe(200);
      expect(await retry.json()).toEqual({ received: true, duplicate: true });
    });

    it('dedupes on type + data.id when the envelope has no id', async () => {
      const raw = JSON.stringify(envelope('message.delivered', { id: 'msg_nodup' }, null));
      const first = await post(raw, signedHeaders(raw));
      expect(await first.json()).toEqual({ received: true });
      const retry = await post(raw, signedHeaders(raw));
      expect(await retry.json()).toEqual({ received: true, duplicate: true });
    });
  });
});
