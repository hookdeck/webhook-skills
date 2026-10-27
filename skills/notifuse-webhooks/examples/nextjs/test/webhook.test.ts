// Generated with: notifuse-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/notifuse/route';

// Notifuse secrets look like "whsec_" + base64(32 random bytes). The HMAC key
// is the decoded part.
const SECRET = 'whsec_' + Buffer.from('notifuse-test-signing-key-0123456').toString('base64');
const otherSecret = (label: string) => 'whsec_' + Buffer.from(label.padEnd(32, '0')).toString('base64');

/** Sign exactly like Notifuse does (Standard Webhooks). */
function sign(rawBody: string, id: string, timestamp: string, secret = SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`, 'utf8').digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);

interface SignOptions {
  prefix?: 'webhook' | 'svix';
  id?: string;
  timestamp?: number | string;
  secret?: string;
  signature?: string;
  contentType?: string;
}

function signedHeaders(rawBody: string, opts: SignOptions = {}): Record<string, string> {
  const prefix = opts.prefix ?? 'webhook';
  const id = opts.id || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(opts.timestamp ?? now());
  return {
    'content-type': opts.contentType ?? 'application/json',
    [`${prefix}-id`]: id,
    [`${prefix}-timestamp`]: ts,
    [`${prefix}-signature`]: opts.signature ?? sign(rawBody, id, ts, opts.secret),
  };
}

function post(rawBody: string, headers: Record<string, string>) {
  return POST(
    new Request('http://localhost:3000/webhooks/notifuse', {
      method: 'POST',
      headers,
      body: rawBody,
    })
  );
}

const envelope = (type: string, data: Record<string, unknown>) => ({
  id: `delivery_${crypto.randomUUID().replace(/-/g, '')}`,
  type,
  timestamp: '2026-10-26T10:30:00Z',
  workspace_id: 'ws_1234567890',
  data,
});

const contact = { id: 'contact_12345', email: 'user@example.com', first_name: 'John' };
const emailData = { message_id: 'msg_xyz789', email: 'user@example.com', subject: 'Welcome' };
const segmentData = { email: 'user@example.com', contact_id: 'contact_12345', segment_id: 'seg_vip', segment_name: 'VIP' };

const EVENTS: Record<string, Record<string, unknown>> = {
  'contact.created': contact,
  'contact.updated': contact,
  'contact.deleted': contact,
  'list.subscribed': { email: 'user@example.com' },
  'list.unsubscribed': { email: 'user@example.com' },
  'list.confirmed': { email: 'user@example.com' },
  'list.resubscribed': { email: 'user@example.com' },
  'list.bounced': { email: 'user@example.com' },
  'list.complained': { email: 'user@example.com' },
  'list.pending': { email: 'user@example.com' },
  'list.removed': { email: 'user@example.com' },
  'segment.joined': segmentData,
  'segment.left': segmentData,
  'email.sent': emailData,
  'email.delivered': emailData,
  'email.opened': emailData,
  'email.clicked': emailData,
  'email.bounced': emailData,
  'email.complained': emailData,
  'email.unsubscribed': emailData,
  'custom_event.created': { event_name: 'orders/fulfilled' },
  'custom_event.updated': { event_name: 'orders/fulfilled' },
  'custom_event.deleted': { event_name: 'orders/fulfilled' },
};

describe('Notifuse webhook handler', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.NOTIFUSE_WEBHOOK_SECRET = SECRET;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('valid deliveries', () => {
    it.each(Object.entries(EVENTS))('accepts %s', async (type, data) => {
      const body = JSON.stringify(envelope(type, data));
      const res = await post(body, signedHeaders(body));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(type));
      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled'));
    });

    it('acknowledges unknown event types', async () => {
      const body = JSON.stringify(envelope('contact.merged', {}));
      const res = await post(body, signedHeaders(body));
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Unhandled Notifuse event type'));
    });

    it('verifies any content type against the raw bytes', async () => {
      const body = JSON.stringify(envelope('contact.created', contact));
      const res = await post(body, signedHeaders(body, { contentType: 'text/plain' }));
      expect(res.status).toBe(200);
    });

    it('verifies a body with unusual whitespace byte for byte', async () => {
      const body = `{ "id" : "delivery_1",\n  "type":"contact.created", "timestamp":"2026-10-26T10:30:00Z", "workspace_id":"ws_1", "data": {"email":"a@example.com","id":"c1"} }`;
      const res = await post(body, signedHeaders(body));
      expect(res.status).toBe(200);
    });

    it('accepts a space-separated list where one v1 entry matches', async () => {
      const body = JSON.stringify(envelope('contact.created', contact));
      const id = 'msg_multi';
      const ts = String(now());
      const old = sign(body, id, ts, otherSecret('previous-key'));
      const res = await post(body, signedHeaders(body, { id, timestamp: ts, signature: `${old} ${sign(body, id, ts)}` }));
      expect(res.status).toBe(200);
    });
  });

  describe('svix-* header fallback', () => {
    it('accepts a delivery signed the same way but sent with svix-* headers', async () => {
      const body = JSON.stringify(envelope('email.sent', emailData));
      const res = await post(body, signedHeaders(body, { prefix: 'svix' }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('prefers webhook-* headers when both are present', async () => {
      const body = JSON.stringify(envelope('email.sent', emailData));
      const res = await post(body, {
        ...signedHeaders(body),
        'svix-id': 'x',
        'svix-timestamp': '1',
        'svix-signature': 'v1,AAAA',
      });
      expect(res.status).toBe(200);
    });

    it('rejects a bad signature sent with svix-* headers', async () => {
      const body = JSON.stringify(envelope('email.sent', emailData));
      const res = await post(body, signedHeaders(body, { prefix: 'svix', secret: otherSecret('another-key') }));
      expect(res.status).toBe(400);
    });
  });

  describe('rejections', () => {
    it('rejects a missing signature header', async () => {
      const body = JSON.stringify(envelope('contact.created', contact));
      const headers = signedHeaders(body);
      delete headers['webhook-signature'];
      expect((await post(body, headers)).status).toBe(400);
    });

    it('rejects all missing headers', async () => {
      expect((await post('{}', { 'content-type': 'application/json' })).status).toBe(400);
    });

    it('rejects a wrong signature', async () => {
      const body = JSON.stringify(envelope('contact.created', contact));
      const res = await post(body, signedHeaders(body, { signature: 'v1,' + Buffer.alloc(32, 1).toString('base64') }));
      expect(res.status).toBe(400);
    });

    it('rejects a signature made with another secret', async () => {
      const body = JSON.stringify(envelope('contact.created', contact));
      const res = await post(body, signedHeaders(body, { secret: otherSecret('a-different-key') }));
      expect(res.status).toBe(400);
    });

    it('rejects a tampered body', async () => {
      const body = JSON.stringify(envelope('contact.created', contact));
      const headers = signedHeaders(body);
      const res = await post(body.replace('user@example.com', 'evil@example.com'), headers);
      expect(res.status).toBe(400);
    });

    it('rejects a timestamp older than 5 minutes', async () => {
      const body = JSON.stringify(envelope('contact.created', contact));
      expect((await post(body, signedHeaders(body, { timestamp: now() - 600 }))).status).toBe(400);
    });

    it('rejects a timestamp too far in the future', async () => {
      const body = JSON.stringify(envelope('contact.created', contact));
      expect((await post(body, signedHeaders(body, { timestamp: now() + 600 }))).status).toBe(400);
    });

    it('rejects a non-numeric timestamp', async () => {
      const body = JSON.stringify(envelope('contact.created', contact));
      expect((await post(body, signedHeaders(body, { timestamp: 'yesterday' }))).status).toBe(400);
    });

    it('rejects a v1a-only signature list', async () => {
      const body = JSON.stringify(envelope('contact.created', contact));
      const id = 'msg_v1a';
      const ts = String(now());
      const sig = sign(body, id, ts).replace('v1,', 'v1a,');
      expect((await post(body, signedHeaders(body, { id, timestamp: ts, signature: sig }))).status).toBe(400);
    });
  });

  describe('fail closed', () => {
    it('returns 500 when the secret is not configured', async () => {
      delete process.env.NOTIFUSE_WEBHOOK_SECRET;
      const body = JSON.stringify(envelope('contact.created', contact));
      expect((await post(body, signedHeaders(body))).status).toBe(500);
    });
  });

  describe('idempotency', () => {
    it('acknowledges a repeated webhook-id as a duplicate', async () => {
      const body = JSON.stringify(envelope('email.opened', emailData));
      const headers = signedHeaders(body, { id: 'msg_dupe_1' });
      expect(await (await post(body, headers)).json()).toEqual({ received: true });
      const second = await post(body, headers);
      expect(second.status).toBe(200);
      expect(await second.json()).toEqual({ received: true, duplicate: true });
    });
  });
});
