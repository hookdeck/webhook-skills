// Generated with: salad-cloud-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// SaladCloud shows the secret as bare base64 (no "whsec_" prefix). The HMAC key
// is its base64 decoding. The standardwebhooks library also accepts the
// "whsec_" + secret form that Hookdeck needs, and derives the same key.
const KEY = Buffer.from('salad-test-signing-key-0123456789');
const SECRET = KEY.toString('base64');
process.env.SALAD_CLOUD_WEBHOOK_SECRET = SECRET;

const { app, verifySaladWebhook, resolveSignatureHeaders } = require('../src/index');

/** Sign exactly like SaladCloud does: HMAC-SHA256 over `${id}.${timestamp}.${body}`. */
function sign(rawBody, id, timestamp, key = KEY) {
  const sig = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`, 'utf8')
    .digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);

/** Build signature headers. `prefix` is 'webhook' (SaladCloud) or 'svix' (fallback). */
function signedHeaders(rawBody, opts = {}) {
  const prefix = opts.prefix || 'webhook';
  const id = opts.id || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(opts.timestamp ?? now());
  return {
    'content-type': 'application/json',
    [`${prefix}-id`]: id,
    [`${prefix}-timestamp`]: ts,
    [`${prefix}-signature`]: opts.signature ?? sign(rawBody, id, ts, opts.key),
  };
}

const jobSucceeded = (jobId = '50150edd-e182-47b5-a754-2d2a04d6ee31') => ({
  type: 'queue.job.succeeded',
  timestamp: '2026-10-05T21:15:34.4256376Z',
  data: {
    id: jobId,
    status: 'succeeded',
    input: { prompt: 'hello' },
    output: { text: 'Hello!' },
    events: [
      { type: 'created', time: '2026-10-05T21:15:32.1180000Z' },
      { type: 'started', time: '2026-10-05T21:15:33.0120000Z' },
      { type: 'succeeded', time: '2026-10-05T21:15:34.4010000Z' },
    ],
    create_time: '2026-10-05T21:15:32.1180000Z',
    update_time: '2026-10-05T21:15:34.4010000Z',
    webhook: 'https://callback.example.com/result',
    organization_name: 'my-organization',
    project_name: 'my-project',
    queue_name: 'my-queue',
  },
});

const send = (payload, headers, path = '/webhooks/salad-cloud') =>
  request(app).post(path).set(headers).send(payload);

describe('SaladCloud webhook endpoint', () => {
  let logSpy;
  let errSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    process.env.SALAD_CLOUD_WEBHOOK_SECRET = SECRET;
  });

  describe('signature verification', () => {
    it('accepts a validly signed delivery with webhook-* headers', async () => {
      const raw = JSON.stringify(jobSucceeded());
      const res = await send(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('accepts the same delivery sent with svix-* headers', async () => {
      const raw = JSON.stringify(jobSucceeded());
      const res = await send(raw, signedHeaders(raw, { prefix: 'svix' }));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('accepts the whsec_-prefixed form of the secret (what Hookdeck needs)', async () => {
      process.env.SALAD_CLOUD_WEBHOOK_SECRET = `whsec_${SECRET}`;
      const raw = JSON.stringify(jobSucceeded());
      const res = await send(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
    });

    it('prefers webhook-* headers when both sets are present', async () => {
      const raw = JSON.stringify(jobSucceeded());
      const good = signedHeaders(raw);
      const res = await send(raw, {
        ...good,
        'svix-id': 'msg_other',
        'svix-timestamp': String(now()),
        'svix-signature': 'v1,AAAA',
      });
      expect(res.status).toBe(200);
    });

    it('verifies the exact bytes, whatever the content type', async () => {
      const raw = '{"type":"queue.job.succeeded",  "timestamp":"t",\n"data":{"id":"j1","status":"succeeded"}}';
      const headers = { ...signedHeaders(raw), 'content-type': 'text/plain' };
      const res = await send(raw, headers);
      expect(res.status).toBe(200);
    });

    it('accepts a delivery signed with several signatures when one is valid', async () => {
      const raw = JSON.stringify(jobSucceeded());
      const id = 'msg_multi';
      const ts = String(now());
      const bad = sign(raw, id, ts, Buffer.from('some-other-secret-value-0123456'));
      const headers = signedHeaders(raw, { id, timestamp: ts, signature: `${bad} ${sign(raw, id, ts)}` });
      const res = await send(raw, headers);
      expect(res.status).toBe(200);
    });

    it('ignores non-v1 signature entries', async () => {
      const raw = JSON.stringify(jobSucceeded());
      const id = 'msg_v1a';
      const ts = String(now());
      const v1 = sign(raw, id, ts);
      const headers = signedHeaders(raw, { id, timestamp: ts, signature: v1.replace('v1,', 'v1a,') });
      const res = await send(raw, headers);
      expect(res.status).toBe(400);
    });

    it('rejects a tampered body', async () => {
      const raw = JSON.stringify(jobSucceeded());
      const headers = signedHeaders(raw);
      const res = await send(raw.replace('Hello!', 'Hacked'), headers);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid signature');
    });

    it('rejects a signature made with another secret', async () => {
      const raw = JSON.stringify(jobSucceeded());
      const res = await send(raw, signedHeaders(raw, { key: Buffer.from('another-secret-key-0123456789ab') }));
      expect(res.status).toBe(400);
    });

    it('rejects a stale timestamp', async () => {
      const raw = JSON.stringify(jobSucceeded());
      const res = await send(raw, signedHeaders(raw, { timestamp: now() - 6 * 60 }));
      expect(res.status).toBe(400);
    });

    it('rejects a timestamp too far in the future', async () => {
      const raw = JSON.stringify(jobSucceeded());
      const res = await send(raw, signedHeaders(raw, { timestamp: now() + 6 * 60 }));
      expect(res.status).toBe(400);
    });

    it.each(['id', 'timestamp', 'signature'])('rejects a delivery missing webhook-%s', async (name) => {
      const raw = JSON.stringify(jobSucceeded());
      const headers = signedHeaders(raw);
      delete headers[`webhook-${name}`];
      const res = await send(raw, headers);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing signature headers');
    });

    it('rejects a delivery with no signature headers', async () => {
      const raw = JSON.stringify(jobSucceeded());
      const res = await send(raw, { 'content-type': 'application/json' });
      expect(res.status).toBe(400);
    });

    it('fails closed when the secret is not configured', async () => {
      delete process.env.SALAD_CLOUD_WEBHOOK_SECRET;
      const raw = JSON.stringify(jobSucceeded());
      const res = await send(raw, signedHeaders(raw));
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Webhook secret not configured');
    });
  });

  describe('event handling', () => {
    it('handles queue.job.succeeded', async () => {
      const raw = JSON.stringify(jobSucceeded());
      const res = await send(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
      expect(logSpy.mock.calls.flat().join('\n')).toContain('Job 50150edd-e182-47b5-a754-2d2a04d6ee31 succeeded in queue my-queue');
    });

    it('acknowledges event types it does not handle', async () => {
      const raw = JSON.stringify({ type: 'queue.job.failed', timestamp: 't', data: { id: 'j2' } });
      const res = await send(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Unhandled SaladCloud event type: queue.job.failed');
    });

    it('acknowledges a repeated webhook-id as a duplicate', async () => {
      const raw = JSON.stringify(jobSucceeded('job-dedupe-1'));
      const headers = signedHeaders(raw, { id: 'msg_dedupe_1' });
      const first = await send(raw, headers);
      expect(first.body).toEqual({ received: true });

      const retry = await send(raw, headers);
      expect(retry.status).toBe(200);
      expect(retry.body).toEqual({ received: true, duplicate: true });
    });
  });

  describe('verifySaladWebhook', () => {
    it('returns the parsed event for a valid delivery', () => {
      const raw = JSON.stringify(jobSucceeded('job-1'));
      const h = signedHeaders(raw);
      const event = verifySaladWebhook(raw, {
        'webhook-id': h['webhook-id'],
        'webhook-timestamp': h['webhook-timestamp'],
        'webhook-signature': h['webhook-signature'],
      });
      expect(event.data.id).toBe('job-1');
      expect(event.type).toBe('queue.job.succeeded');
    });

    it('throws for an invalid signature', () => {
      const raw = JSON.stringify(jobSucceeded());
      expect(() =>
        verifySaladWebhook(raw, { 'webhook-id': 'x', 'webhook-timestamp': String(now()), 'webhook-signature': 'v1,AAAA' })
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
