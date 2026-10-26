// Generated with: velt-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/velt/route';

// Velt secrets are Standard Webhooks secrets: "whsec_" + base64(key bytes), for
// example "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw7Jxx2Oll+OE=". The HMAC key is
// the decoded part.
const SECRET = 'whsec_' + Buffer.from('velt-test-signing-key-0123456789').toString('base64');

/** Sign exactly like Velt does: HMAC-SHA256 over `${id}.${timestamp}.${body}`. */
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

/** Build signature headers. `prefix` is 'webhook' (Velt) or 'svix' (fallback). */
function signedHeaders(rawBody: string, opts: SignOptions = {}): Record<string, string> {
  const prefix = opts.prefix ?? 'webhook';
  const id = opts.id || hex24();
  const ts = String(opts.timestamp ?? now());
  return {
    'content-type': 'application/json',
    'user-agent': 'Svix-Webhooks/1.0',
    [`${prefix}-id`]: id,
    [`${prefix}-timestamp`]: ts,
    [`${prefix}-signature`]: opts.signature ?? sign(rawBody, id, ts, opts.secret),
  };
}

function post(rawBody: string, headers: Record<string, string>) {
  return POST(
    new Request('http://localhost:3000/webhooks/velt', {
      method: 'POST',
      headers,
      body: rawBody,
    })
  );
}

/** Advanced (V2) payload: { actionType, data, event, platform, source, webhookId }. */
function payloadFor(event: string, extra: Record<string, unknown> = {}) {
  return {
    actionType: 'add',
    data: {
      actionUser: { userId: 'user123', name: 'Actor User', organizationId: 'org123' },
      commentAnnotation: { annotationId: 'anno-xyz', comments: [] },
      metadata: {
        apiKey: 'VKabul7W2DJhLu1BiMaj',
        document: { documentId: 'doc-1', documentName: 'Doc One' },
        organization: { organizationId: 'org123' },
      },
      ...extra,
    },
    event,
    platform: 'sdk',
    source: event.split('.')[0].replace('_annotation', ''),
    webhookId: 'dummyWebhookId',
  };
}

const commentAdd = () => payloadFor('comment.add');

describe('Velt webhook route', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.VELT_WEBHOOK_SECRET = SECRET;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    process.env.VELT_WEBHOOK_SECRET = SECRET;
  });

  describe('signature verification', () => {
    it('accepts a validly signed delivery with webhook-* headers', async () => {
      const raw = JSON.stringify(commentAdd());
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts the same delivery sent with svix-* headers', async () => {
      const raw = JSON.stringify(commentAdd());
      const res = await post(raw, signedHeaders(raw, { prefix: 'svix' }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('prefers webhook-* headers when both sets are present', async () => {
      const raw = JSON.stringify(commentAdd());
      const res = await post(raw, {
        ...signedHeaders(raw),
        'svix-id': 'other-id',
        'svix-timestamp': String(now()),
        'svix-signature': 'v1,AAAA',
      });
      expect(res.status).toBe(200);
    });

    it('verifies the exact bytes, whatever the content type', async () => {
      const raw = '{"event":  "huddle.join",\n"data":{"metadata":{"document":{"documentId":"doc-1"}}}}';
      const res = await post(raw, { ...signedHeaders(raw), 'content-type': 'text/plain' });
      expect(res.status).toBe(200);
    });

    it('accepts a delivery signed with several signatures when one is valid', async () => {
      const raw = JSON.stringify(commentAdd());
      const id = 'multi-id';
      const ts = String(now());
      const bad = sign(raw, id, ts, 'whsec_' + Buffer.from('some-other-secret-value-0123456').toString('base64'));
      const res = await post(raw, signedHeaders(raw, { id, timestamp: ts, signature: `${bad} ${sign(raw, id, ts)}` }));
      expect(res.status).toBe(200);
    });

    it('ignores non-v1 signature entries', async () => {
      const raw = JSON.stringify(commentAdd());
      const id = 'v1a-id';
      const ts = String(now());
      const res = await post(raw, signedHeaders(raw, { id, timestamp: ts, signature: sign(raw, id, ts).replace('v1,', 'v1a,') }));
      expect(res.status).toBe(400);
    });

    it('rejects a tampered body', async () => {
      const raw = JSON.stringify(commentAdd());
      const headers = signedHeaders(raw);
      const res = await post(raw.replace('anno-xyz', 'Hacked'), headers);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid signature' });
    });

    it('rejects a signature made with another secret', async () => {
      const raw = JSON.stringify(commentAdd());
      const other = 'whsec_' + Buffer.from('another-endpoint-secret-0123456').toString('base64');
      const res = await post(raw, signedHeaders(raw, { secret: other }));
      expect(res.status).toBe(400);
    });

    it('rejects a stale timestamp', async () => {
      const raw = JSON.stringify(commentAdd());
      const res = await post(raw, signedHeaders(raw, { timestamp: now() - 6 * 60 }));
      expect(res.status).toBe(400);
    });

    it('rejects a timestamp too far in the future', async () => {
      const raw = JSON.stringify(commentAdd());
      const res = await post(raw, signedHeaders(raw, { timestamp: now() + 6 * 60 }));
      expect(res.status).toBe(400);
    });

    it.each(['id', 'timestamp', 'signature'])('rejects a delivery missing webhook-%s', async (name) => {
      const raw = JSON.stringify(commentAdd());
      const headers = signedHeaders(raw);
      delete headers[`webhook-${name}`];
      const res = await post(raw, headers);
      expect(res.status).toBe(400);
    });

    it('rejects a delivery with no signature headers', async () => {
      const raw = JSON.stringify(commentAdd());
      const res = await post(raw, { 'content-type': 'application/json' });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Missing signature headers' });
    });

    it('fails closed when the secret is not configured', async () => {
      delete process.env.VELT_WEBHOOK_SECRET;
      const raw = JSON.stringify(commentAdd());
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Webhook secret not configured' });
    });
  });

  describe('event handling', () => {
    const events: string[] = [
      'comment_annotation.add',
      'comment_annotation.assign',
      'comment_annotation.status_change',
      'comment_annotation.priority_change',
      'comment_annotation.custom_list_change',
      'comment_annotation.subscribe',
      'comment_annotation.unsubscribe',
      'comment_annotation.accept',
      'comment_annotation.reject',
      'comment_annotation.approve',
      'comment_annotation.suggestion_accept',
      'comment_annotation.suggestion_reject',
      'comment.add',
      'comment.update',
      'comment.delete',
      'comment.reaction_add',
      'comment.reaction_delete',
      'huddle.create',
      'huddle.join',
      'crdt.update_data',
      'recorder.done',
      'execution.dispatched',
      'execution.completed',
      'execution.failed',
      'execution.cancelled',
      'step.awaiting-approval',
      'step.completed',
      'step.failed',
      'step.breached',
      'step.cancelled',
      'group.quorum-met',
      'loop.iteration-started',
      'loop.exhausted',
    ];

    it.each(events)('handles %s', async (event) => {
      const raw = JSON.stringify(payloadFor(event));
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
      expect(logSpy.mock.calls.flat().join('\n')).not.toContain('Unhandled');
    });

    it('logs the annotation and document of a comment event', async () => {
      const raw = JSON.stringify(commentAdd());
      await post(raw, signedHeaders(raw));
      expect(logSpy).toHaveBeenCalledWith('comment.add: anno-xyz in doc-1');
    });

    it('logs the CRDT document of a crdt.update_data event', async () => {
      const raw = JSON.stringify(
        payloadFor('crdt.update_data', { commentAnnotation: undefined, crdtData: { id: 'crdt-todos-1', data: [] } })
      );
      await post(raw, signedHeaders(raw));
      expect(logSpy).toHaveBeenCalledWith('CRDT data updated: crdt-todos-1 in doc-1');
    });

    it('acknowledges event types it does not handle', async () => {
      const raw = JSON.stringify(payloadFor('invoice.created'));
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Unhandled Velt event type: invoice.created');
    });

    it('acknowledges a verified encrypted payload without an event field', async () => {
      const raw = JSON.stringify({ encryptedData: 'AAAA', encryptedKey: 'BBBB', iv: 'CCCC' });
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Unhandled Velt event type: undefined');
    });

    it('acknowledges a retry of the same webhook-id as a duplicate, with a fresh timestamp', async () => {
      const raw = JSON.stringify(commentAdd());
      const id = 'msg_dedupe_1';
      const first = await post(raw, signedHeaders(raw, { id }));
      expect(await first.json()).toEqual({ received: true });

      const retry = await post(raw, signedHeaders(raw, { id, timestamp: now() + 1 }));
      expect(retry.status).toBe(200);
      expect(await retry.json()).toEqual({ received: true, duplicate: true });
    });
  });
});
