// Generated with: skovik-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/skovik/route';

// Skovik secrets are Standard Webhooks secrets: "whsec_" + base64(key bytes), for
// example "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw7Jxx2Oll+OE=". The HMAC key is
// the decoded part.
const SECRET = 'whsec_' + Buffer.from('skovik-test-signing-key-0123456789').toString('base64');

/** Sign exactly like Skovik does: HMAC-SHA256 over `${id}.${timestamp}.${body}`. */
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

/** Build signature headers. `prefix` is 'webhook' (Skovik) or 'svix' (fallback). */
function signedHeaders(rawBody: string, opts: SignOptions = {}): Record<string, string> {
  const prefix = opts.prefix ?? 'webhook';
  const id = opts.id || `hex24()`;
  const ts = String(opts.timestamp ?? now());
  return {
    'content-type': 'application/json',
    'user-agent': 'Skovik-Webhook (+https://developer.skovik.com)',
    [`${prefix}-id`]: id,
    [`${prefix}-timestamp`]: ts,
    [`${prefix}-signature`]: opts.signature ?? sign(rawBody, id, ts, opts.secret),
  };
}

function post(rawBody: string, headers: Record<string, string>) {
  return POST(
    new Request('http://localhost:3000/webhooks/skovik', {
      method: 'POST',
      headers,
      body: rawBody,
    })
  );
}

interface Related {
  type: string;
  id: string;
}

/** Thin JSON:API-style notification; the related resource is only linked. */
const envelope = (type: string, related: Related | null, eventId: string = hex24()) => {
  const data: Record<string, unknown> = {
    id: eventId,
    type: 'webhook_events',
    attributes: { created_at: '2026-05-25T14:30:45Z', name: type },
    links: { self: `/v1/webhook_events/${eventId}` },
  };
  if (related) {
    data.relationships = {
      related_object: {
        data: { type: related.type, id: related.id },
        links: { related: `/v1/${related.type}/${related.id}` },
      },
    };
  }
  return { id: hex24(), type, timestamp: '2026-05-25T14:30:45Z', data };
};

const exportCompleted = (eventId?: string) =>
  envelope('export_orders.completed', { type: 'export_orders', id: 'f3a9c7e15b344a8cb6f122b0' }, eventId);

describe('Skovik webhook route', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.SKOVIK_WEBHOOK_SECRET = SECRET;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    process.env.SKOVIK_WEBHOOK_SECRET = SECRET;
  });

  describe('signature verification', () => {
    it('accepts a validly signed delivery with webhook-* headers', async () => {
      const raw = JSON.stringify(exportCompleted());
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts the same delivery sent with svix-* headers', async () => {
      const raw = JSON.stringify(exportCompleted());
      const res = await post(raw, signedHeaders(raw, { prefix: 'svix' }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('prefers webhook-* headers when both sets are present', async () => {
      const raw = JSON.stringify(exportCompleted());
      const res = await post(raw, {
        ...signedHeaders(raw),
        'svix-id': 'other-id',
        'svix-timestamp': String(now()),
        'svix-signature': 'v1,AAAA',
      });
      expect(res.status).toBe(200);
    });

    it('verifies the exact bytes, whatever the content type', async () => {
      const raw = '{"id":"d-1",  "type":"misc.ping",\n"timestamp":"2026-05-25T14:30:45Z","data":{"id":"e-1","type":"webhook_events"}}';
      const res = await post(raw, { ...signedHeaders(raw), 'content-type': 'text/plain' });
      expect(res.status).toBe(200);
    });

    it('accepts a delivery signed with several signatures when one is valid', async () => {
      const raw = JSON.stringify(exportCompleted());
      const id = 'multi-id';
      const ts = String(now());
      const bad = sign(raw, id, ts, 'whsec_' + Buffer.from('some-other-secret-value-0123456').toString('base64'));
      const res = await post(raw, signedHeaders(raw, { id, timestamp: ts, signature: `${bad} ${sign(raw, id, ts)}` }));
      expect(res.status).toBe(200);
    });

    it('ignores non-v1 signature entries', async () => {
      const raw = JSON.stringify(exportCompleted());
      const id = 'v1a-id';
      const ts = String(now());
      const res = await post(raw, signedHeaders(raw, { id, timestamp: ts, signature: sign(raw, id, ts).replace('v1,', 'v1a,') }));
      expect(res.status).toBe(400);
    });

    it('rejects a tampered body', async () => {
      const raw = JSON.stringify(exportCompleted());
      const headers = signedHeaders(raw);
      const res = await post(raw.replace('f3a9c7e15b344a8cb6f122b0', 'Hacked'), headers);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid signature' });
    });

    it('rejects a signature made with another secret', async () => {
      const raw = JSON.stringify(exportCompleted());
      const other = 'whsec_' + Buffer.from('another-endpoint-secret-0123456').toString('base64');
      const res = await post(raw, signedHeaders(raw, { secret: other }));
      expect(res.status).toBe(400);
    });

    it('rejects a stale timestamp', async () => {
      const raw = JSON.stringify(exportCompleted());
      const res = await post(raw, signedHeaders(raw, { timestamp: now() - 6 * 60 }));
      expect(res.status).toBe(400);
    });

    it('rejects a timestamp too far in the future', async () => {
      const raw = JSON.stringify(exportCompleted());
      const res = await post(raw, signedHeaders(raw, { timestamp: now() + 6 * 60 }));
      expect(res.status).toBe(400);
    });

    it.each(['id', 'timestamp', 'signature'])('rejects a delivery missing webhook-%s', async (name) => {
      const raw = JSON.stringify(exportCompleted());
      const headers = signedHeaders(raw);
      delete headers[`webhook-${name}`];
      const res = await post(raw, headers);
      expect(res.status).toBe(400);
    });

    it('rejects a delivery with no signature headers', async () => {
      const raw = JSON.stringify(exportCompleted());
      const res = await post(raw, { 'content-type': 'application/json' });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Missing signature headers' });
    });

    it('fails closed when the secret is not configured', async () => {
      delete process.env.SKOVIK_WEBHOOK_SECRET;
      const raw = JSON.stringify(exportCompleted());
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Webhook secret not configured' });
    });
  });

  describe('event handling', () => {
    const user = { type: 'users', id: '5a1c0de9b7d84f6e8c3a2b10' };
    const exportOrder = { type: 'export_orders', id: 'f3a9c7e15b344a8cb6f122b0' };
    const branch = { type: 'branches', id: '9c2e7f4a1d6b4e0f8a5b3c21' };
    const cases: Array<[string, Related | null]> = [
      ['users.created', user],
      ['users.updated', user],
      ['users.archived', user],
      ['export_orders.created', exportOrder],
      ['export_orders.completed', exportOrder],
      ['export_orders.failed', exportOrder],
      ['branches.created', branch],
      ['branches.updated', branch],
      ['branches.archived', branch],
      ['misc.ping', null],
    ];

    it.each(cases)('handles %s', async (type, related) => {
      const raw = JSON.stringify(envelope(type, related));
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
      expect(logSpy.mock.calls.flat().join('\n')).not.toContain('Unhandled');
    });

    it('logs the related resource of a delivery', async () => {
      const raw = JSON.stringify(exportCompleted());
      await post(raw, signedHeaders(raw));
      expect(logSpy).toHaveBeenCalledWith('Export order completed: export_orders/f3a9c7e15b344a8cb6f122b0');
    });

    it('acknowledges event types it does not handle', async () => {
      const raw = JSON.stringify(envelope('invoices.created', { type: 'invoices', id: 'i1' }));
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Unhandled Skovik event type: invoices.created');
    });

    it('acknowledges a retried event id as a duplicate, even with a new webhook-id', async () => {
      const raw = JSON.stringify(exportCompleted('evt-dedupe-1'));
      const first = await post(raw, signedHeaders(raw));
      expect(await first.json()).toEqual({ received: true });

      const retry = await post(raw, signedHeaders(raw));
      expect(retry.status).toBe(200);
      expect(await retry.json()).toEqual({ received: true, duplicate: true });
    });
  });
});
