// Generated with: salad-cloud-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/salad-cloud/route';

// SaladCloud shows the secret as bare base64 (no "whsec_" prefix). The HMAC key
// is its base64 decoding. The standardwebhooks library also accepts the
// "whsec_" + secret form that Hookdeck needs, and derives the same key.
const KEY = Buffer.from('salad-test-signing-key-0123456789');
const SECRET = KEY.toString('base64');

/** Sign exactly like SaladCloud does: HMAC-SHA256 over `${id}.${timestamp}.${body}`. */
function sign(rawBody: string, id: string, timestamp: string, key: Buffer = KEY): string {
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
  key?: Buffer;
  signature?: string;
}

/** Build signature headers. `prefix` is 'webhook' (SaladCloud) or 'svix' (fallback). */
function signedHeaders(rawBody: string, opts: SignOptions = {}): Record<string, string> {
  const prefix = opts.prefix ?? 'webhook';
  const id = opts.id || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(opts.timestamp ?? now());
  return {
    'content-type': 'application/json',
    [`${prefix}-id`]: id,
    [`${prefix}-timestamp`]: ts,
    [`${prefix}-signature`]: opts.signature ?? sign(rawBody, id, ts, opts.key),
  };
}

function post(rawBody: string, headers: Record<string, string>) {
  return POST(
    new Request('http://localhost:3000/webhooks/salad-cloud', {
      method: 'POST',
      headers,
      body: rawBody,
    })
  );
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

describe('SaladCloud webhook route', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.SALAD_CLOUD_WEBHOOK_SECRET = SECRET;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  describe('signature verification', () => {
    it('accepts a validly signed delivery with webhook-* headers', async () => {
      const raw = JSON.stringify(jobSucceeded());
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts the same delivery sent with svix-* headers', async () => {
      const raw = JSON.stringify(jobSucceeded());
      const res = await post(raw, signedHeaders(raw, { prefix: 'svix' }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts the whsec_-prefixed form of the secret (what Hookdeck needs)', async () => {
      process.env.SALAD_CLOUD_WEBHOOK_SECRET = `whsec_${SECRET}`;
      const raw = JSON.stringify(jobSucceeded());
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
    });

    it('prefers webhook-* headers when both sets are present', async () => {
      const raw = JSON.stringify(jobSucceeded());
      const res = await post(raw, {
        ...signedHeaders(raw),
        'svix-id': 'msg_other',
        'svix-timestamp': String(now()),
        'svix-signature': 'v1,AAAA',
      });
      expect(res.status).toBe(200);
    });

    it('verifies the exact bytes, whatever the content type', async () => {
      const raw = '{"type":"queue.job.succeeded",  "timestamp":"t",\n"data":{"id":"j1","status":"succeeded"}}';
      const res = await post(raw, { ...signedHeaders(raw), 'content-type': 'text/plain' });
      expect(res.status).toBe(200);
    });

    it('accepts a delivery signed with several signatures when one is valid', async () => {
      const raw = JSON.stringify(jobSucceeded());
      const id = 'msg_multi';
      const ts = String(now());
      const bad = sign(raw, id, ts, Buffer.from('some-other-secret-value-0123456'));
      const res = await post(raw, signedHeaders(raw, { id, timestamp: ts, signature: `${bad} ${sign(raw, id, ts)}` }));
      expect(res.status).toBe(200);
    });

    it('ignores non-v1 signature entries', async () => {
      const raw = JSON.stringify(jobSucceeded());
      const id = 'msg_v1a';
      const ts = String(now());
      const v1a = sign(raw, id, ts).replace('v1,', 'v1a,');
      const res = await post(raw, signedHeaders(raw, { id, timestamp: ts, signature: v1a }));
      expect(res.status).toBe(400);
    });

    it('rejects a tampered body', async () => {
      const raw = JSON.stringify(jobSucceeded());
      const res = await post(raw.replace('Hello!', 'Hacked'), signedHeaders(raw));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Invalid signature');
    });

    it('rejects a signature made with another secret', async () => {
      const raw = JSON.stringify(jobSucceeded());
      const res = await post(raw, signedHeaders(raw, { key: Buffer.from('another-secret-key-0123456789ab') }));
      expect(res.status).toBe(400);
    });

    it('rejects a stale timestamp', async () => {
      const raw = JSON.stringify(jobSucceeded());
      const res = await post(raw, signedHeaders(raw, { timestamp: now() - 6 * 60 }));
      expect(res.status).toBe(400);
    });

    it('rejects a timestamp too far in the future', async () => {
      const raw = JSON.stringify(jobSucceeded());
      const res = await post(raw, signedHeaders(raw, { timestamp: now() + 6 * 60 }));
      expect(res.status).toBe(400);
    });

    it.each(['id', 'timestamp', 'signature'])('rejects a delivery missing webhook-%s', async (name) => {
      const raw = JSON.stringify(jobSucceeded());
      const headers = signedHeaders(raw);
      delete headers[`webhook-${name}`];
      const res = await post(raw, headers);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Missing signature headers');
    });

    it('rejects a delivery with no signature headers', async () => {
      const raw = JSON.stringify(jobSucceeded());
      const res = await post(raw, { 'content-type': 'application/json' });
      expect(res.status).toBe(400);
    });

    it('fails closed when the secret is not configured', async () => {
      delete process.env.SALAD_CLOUD_WEBHOOK_SECRET;
      const raw = JSON.stringify(jobSucceeded());
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe('Webhook secret not configured');
    });
  });

  describe('event handling', () => {
    it('handles queue.job.succeeded', async () => {
      const raw = JSON.stringify(jobSucceeded());
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(logSpy.mock.calls.flat().join('\n')).toContain('Job 50150edd-e182-47b5-a754-2d2a04d6ee31 succeeded in queue my-queue');
    });

    it('acknowledges event types it does not handle', async () => {
      const raw = JSON.stringify({ type: 'queue.job.failed', timestamp: 't', data: { id: 'j2' } });
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Unhandled SaladCloud event type: queue.job.failed');
    });

    it('acknowledges a repeated webhook-id as a duplicate', async () => {
      const raw = JSON.stringify(jobSucceeded('job-dedupe-1'));
      const headers = signedHeaders(raw, { id: 'msg_dedupe_1' });
      expect(await (await post(raw, headers)).json()).toEqual({ received: true });

      const retry = await post(raw, headers);
      expect(retry.status).toBe(200);
      expect(await retry.json()).toEqual({ received: true, duplicate: true });
    });
  });
});
