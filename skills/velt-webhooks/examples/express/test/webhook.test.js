// Generated with: velt-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Velt secrets are Standard Webhooks secrets: "whsec_" + base64(key bytes), for
// example "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw7Jxx2Oll+OE=". The HMAC key is
// the decoded part.
const SECRET = 'whsec_' + Buffer.from('velt-test-signing-key-0123456789').toString('base64');
process.env.VELT_WEBHOOK_SECRET = SECRET;

const { app, verifyVeltWebhook, resolveSignatureHeaders } = require('../src/index');

/** Sign exactly like Velt does: HMAC-SHA256 over `${id}.${timestamp}.${body}`. */
function sign(rawBody, id, timestamp, secret = SECRET) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`, 'utf8')
    .digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);
const hex24 = () => crypto.randomBytes(12).toString('hex');

/** Build signature headers. `prefix` is 'webhook' (Velt) or 'svix' (fallback). */
function signedHeaders(rawBody, opts = {}) {
  const prefix = opts.prefix || 'webhook';
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

/** Advanced (V2) payload: { actionType, data, event, platform, source, webhookId }. */
function payloadFor(event, extra = {}) {
  const source = event.split('.')[0].replace('_annotation', '');
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
    source,
    webhookId: 'dummyWebhookId',
  };
}

const commentAdd = () => payloadFor('comment.add');

const send = (payload, headers, path = '/webhooks/velt') =>
  request(app).post(path).set(headers).send(payload);

describe('Velt webhook endpoint', () => {
  let logSpy;
  let errSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    process.env.VELT_WEBHOOK_SECRET = SECRET;
  });

  describe('signature verification', () => {
    it('accepts a validly signed delivery with webhook-* headers', async () => {
      const raw = JSON.stringify(commentAdd());
      const res = await send(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('accepts the same delivery sent with svix-* headers', async () => {
      const raw = JSON.stringify(commentAdd());
      const res = await send(raw, signedHeaders(raw, { prefix: 'svix' }));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('prefers webhook-* headers when both sets are present', async () => {
      const raw = JSON.stringify(commentAdd());
      const good = signedHeaders(raw);
      const res = await send(raw, {
        ...good,
        'svix-id': 'other-id',
        'svix-timestamp': String(now()),
        'svix-signature': 'v1,AAAA',
      });
      expect(res.status).toBe(200);
    });

    it('verifies the exact bytes, whatever the content type', async () => {
      const raw = '{"event":  "huddle.join",\n"data":{"metadata":{"document":{"documentId":"doc-1"}}}}';
      const headers = { ...signedHeaders(raw), 'content-type': 'text/plain' };
      const res = await send(raw, headers);
      expect(res.status).toBe(200);
    });

    it('accepts a delivery signed with several signatures when one is valid', async () => {
      const raw = JSON.stringify(commentAdd());
      const id = 'multi-id';
      const ts = String(now());
      const bad = sign(raw, id, ts, 'whsec_' + Buffer.from('some-other-secret-value-0123456').toString('base64'));
      const headers = signedHeaders(raw, { id, timestamp: ts, signature: `${bad} ${sign(raw, id, ts)}` });
      const res = await send(raw, headers);
      expect(res.status).toBe(200);
    });

    it('ignores non-v1 signature entries', async () => {
      const raw = JSON.stringify(commentAdd());
      const id = 'v1a-id';
      const ts = String(now());
      const v1 = sign(raw, id, ts);
      const headers = signedHeaders(raw, { id, timestamp: ts, signature: v1.replace('v1,', 'v1a,') });
      const res = await send(raw, headers);
      expect(res.status).toBe(400);
    });

    it('rejects a tampered body', async () => {
      const raw = JSON.stringify(commentAdd());
      const headers = signedHeaders(raw);
      const res = await send(raw.replace('anno-xyz', 'anno-abc'), headers);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid signature');
    });

    it('rejects a signature made with another secret', async () => {
      const raw = JSON.stringify(commentAdd());
      const other = 'whsec_' + Buffer.from('another-endpoint-secret-0123456').toString('base64');
      const res = await send(raw, signedHeaders(raw, { secret: other }));
      expect(res.status).toBe(400);
    });

    it('rejects a stale timestamp', async () => {
      const raw = JSON.stringify(commentAdd());
      const res = await send(raw, signedHeaders(raw, { timestamp: now() - 6 * 60 }));
      expect(res.status).toBe(400);
    });

    it('rejects a timestamp too far in the future', async () => {
      const raw = JSON.stringify(commentAdd());
      const res = await send(raw, signedHeaders(raw, { timestamp: now() + 6 * 60 }));
      expect(res.status).toBe(400);
    });

    it.each(['id', 'timestamp', 'signature'])('rejects a delivery missing webhook-%s', async (name) => {
      const raw = JSON.stringify(commentAdd());
      const headers = signedHeaders(raw);
      delete headers[`webhook-${name}`];
      const res = await send(raw, headers);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing signature headers');
    });

    it('rejects a delivery with no signature headers', async () => {
      const raw = JSON.stringify(commentAdd());
      const res = await send(raw, { 'content-type': 'application/json' });
      expect(res.status).toBe(400);
    });

    it('fails closed when the secret is not configured', async () => {
      delete process.env.VELT_WEBHOOK_SECRET;
      const raw = JSON.stringify(commentAdd());
      const res = await send(raw, signedHeaders(raw));
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Webhook secret not configured');
    });
  });

  describe('event handling', () => {
    const events = [
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
      const res = await send(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
      expect(logSpy.mock.calls.flat().join('\n')).not.toContain('Unhandled');
    });

    it('logs the annotation and document of a comment event', async () => {
      const raw = JSON.stringify(commentAdd());
      await send(raw, signedHeaders(raw));
      expect(logSpy).toHaveBeenCalledWith('comment.add: anno-xyz in doc-1');
    });

    it('logs the CRDT document of a crdt.update_data event', async () => {
      const raw = JSON.stringify(
        payloadFor('crdt.update_data', { commentAnnotation: undefined, crdtData: { id: 'crdt-todos-1', data: [] } })
      );
      await send(raw, signedHeaders(raw));
      expect(logSpy).toHaveBeenCalledWith('CRDT data updated: crdt-todos-1 in doc-1');
    });

    it('acknowledges event types it does not handle', async () => {
      const raw = JSON.stringify(payloadFor('invoice.created'));
      const res = await send(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Unhandled Velt event type: invoice.created');
    });

    it('acknowledges a verified encrypted payload without an event field', async () => {
      const raw = JSON.stringify({ encryptedData: 'AAAA', encryptedKey: 'BBBB', iv: 'CCCC' });
      const res = await send(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Unhandled Velt event type: undefined');
    });

    it('acknowledges a retry of the same webhook-id as a duplicate, with a fresh timestamp', async () => {
      const raw = JSON.stringify(commentAdd());
      const id = 'msg_dedupe_1';
      const first = await send(raw, signedHeaders(raw, { id }));
      expect(first.body).toEqual({ received: true });

      const retry = await send(raw, signedHeaders(raw, { id, timestamp: now() + 1 }));
      expect(retry.status).toBe(200);
      expect(retry.body).toEqual({ received: true, duplicate: true });
    });
  });

  describe('verifyVeltWebhook', () => {
    it('returns the parsed event for a valid delivery', () => {
      const raw = JSON.stringify(commentAdd());
      const h = signedHeaders(raw);
      const event = verifyVeltWebhook(raw, {
        'webhook-id': h['webhook-id'],
        'webhook-timestamp': h['webhook-timestamp'],
        'webhook-signature': h['webhook-signature'],
      });
      expect(event.event).toBe('comment.add');
      expect(event.data.commentAnnotation.annotationId).toBe('anno-xyz');
    });

    it('throws for an invalid signature', () => {
      const raw = JSON.stringify(commentAdd());
      expect(() =>
        verifyVeltWebhook(raw, { 'webhook-id': 'x', 'webhook-timestamp': String(now()), 'webhook-signature': 'v1,AAAA' })
      ).toThrow();
    });
  });

  describe('resolveSignatureHeaders', () => {
    it('maps svix-* headers to the webhook-* names when webhook-id is absent', () => {
      const h = { 'svix-id': 'a', 'svix-timestamp': '1', 'svix-signature': 'v1,x' };
      expect(resolveSignatureHeaders((n) => h[n])).toEqual({
        'webhook-id': 'a',
        'webhook-timestamp': '1',
        'webhook-signature': 'v1,x',
      });
    });

    it('returns null when a header is missing', () => {
      const h = { 'webhook-id': 'a', 'webhook-timestamp': '1' };
      expect(resolveSignatureHeaders((n) => h[n])).toBeNull();
    });
  });

  it('serves a health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
