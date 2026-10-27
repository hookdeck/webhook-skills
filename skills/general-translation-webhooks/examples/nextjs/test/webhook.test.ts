// Generated with: general-translation-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/general-translation/route';

// Secrets look like "whsec_" + base64(key bytes). The HMAC key is the decoded part.
const SECRET = 'whsec_' + Buffer.from('gt-test-signing-key-0123456789abcd').toString('base64');

/** Sign exactly like Standard Webhooks: base64(HMAC-SHA256(key, "{id}.{ts}.{body}")). */
function sign(rawBody: string, id: string, timestamp: string, secret = SECRET, version = 'v1'): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`, 'utf8').digest('base64');
  return `${version},${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);
const newId = () => `evt_${crypto.randomUUID().replace(/-/g, '')}`;

interface SignOptions {
  id?: string;
  timestamp?: number | string;
  secret?: string;
  signature?: string;
  prefix?: 'webhook' | 'svix';
}

function signedHeaders(rawBody: string, opts: SignOptions = {}): Record<string, string> {
  const prefix = opts.prefix ?? 'webhook';
  const id = opts.id ?? newId();
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
    new Request('http://localhost/webhooks/general-translation', { method: 'POST', headers, body: rawBody })
  );
}

const envelope = (type: string, object: Record<string, unknown>, id = newId()) =>
  JSON.stringify({
    id,
    object: 'event',
    type,
    createdAt: '2026-04-30T12:00:00.000Z',
    apiVersion: '2026-03-06.v1',
    data: { object },
  });

const translatedFile = (extra: Record<string, unknown> = {}) => ({
  object: 'translated_file',
  id: 'trf_xxx',
  orgId: 'org_xxx',
  projectId: 'project_xxx',
  branchId: 'branch_xxx',
  sourceFileId: 'src_xxx',
  fileId: 'file_xxx',
  versionId: 'ver_xxx',
  locale: 'fr',
  fileFormat: 'JSON',
  dataFormat: null,
  ...extra,
});

const completedFile = () =>
  envelope('translated_file.completed', translatedFile({ completedAt: '2026-04-30T12:00:00.000Z' }));

beforeEach(() => {
  process.env.GENERAL_TRANSLATION_WEBHOOK_SECRET = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('POST /webhooks/general-translation', () => {
  describe('valid deliveries', () => {
    it('accepts translated_file.completed', async () => {
      const body = completedFile();
      const res = await post(body, signedHeaders(body));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts translated_file.edited', async () => {
      const body = envelope('translated_file.edited', translatedFile({ editedAt: '2026-04-30T12:05:00.000Z' }));
      const res = await post(body, signedHeaders(body));
      expect(res.status).toBe(200);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('edited'));
    });

    it('accepts translation_job.completed', async () => {
      const body = envelope('translation_job.completed', {
        object: 'translation_job',
        jobId: 'job_xxx',
        completedAt: '2026-04-30T12:00:00.000Z',
      });
      const res = await post(body, signedHeaders(body));
      expect(res.status).toBe(200);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('job_xxx'));
    });

    it('acknowledges unknown event types with 200', async () => {
      const body = envelope('translation_job.failed', { object: 'translation_job', jobId: 'job_1' });
      const res = await post(body, signedHeaders(body));
      expect(res.status).toBe(200);
    });

    it('verifies the raw bytes for any content type', async () => {
      const body = completedFile();
      const res = await post(body, { ...signedHeaders(body), 'content-type': 'text/plain' });
      expect(res.status).toBe(200);
    });

    it('verifies a body with unusual whitespace byte for byte', async () => {
      const body = JSON.stringify(JSON.parse(completedFile()), null, 4);
      const res = await post(body, signedHeaders(body));
      expect(res.status).toBe(200);
    });
  });

  describe('header prefix fallback', () => {
    it('accepts a delivery sent with svix-* headers', async () => {
      const body = completedFile();
      const res = await post(body, signedHeaders(body, { prefix: 'svix' }));
      expect(res.status).toBe(200);
    });

    it('rejects a tampered body sent with svix-* headers', async () => {
      const body = completedFile();
      const res = await post(body.replace('"fr"', '"de"'), signedHeaders(body, { prefix: 'svix' }));
      expect(res.status).toBe(401);
    });

    it('prefers webhook-* headers when both sets are present', async () => {
      const body = completedFile();
      const good = signedHeaders(body);
      const bad = signedHeaders(body, { prefix: 'svix', signature: 'v1,AAAA' });
      const res = await post(body, { ...good, ...bad });
      expect(res.status).toBe(200);
    });
  });

  describe('signature checks', () => {
    it('rejects a tampered body', async () => {
      const body = completedFile();
      const res = await post(body.replace('"fr"', '"de"'), signedHeaders(body));
      expect(res.status).toBe(401);
    });

    it("rejects another endpoint's secret", async () => {
      const body = completedFile();
      const other = 'whsec_' + Buffer.from('some-other-endpoint-secret-key!!').toString('base64');
      const res = await post(body, signedHeaders(body, { secret: other }));
      expect(res.status).toBe(401);
    });

    it('rejects a timestamp older than 5 minutes', async () => {
      const body = completedFile();
      const res = await post(body, signedHeaders(body, { timestamp: now() - 6 * 60 }));
      expect(res.status).toBe(401);
    });

    it('rejects a timestamp too far in the future', async () => {
      const body = completedFile();
      const res = await post(body, signedHeaders(body, { timestamp: now() + 6 * 60 }));
      expect(res.status).toBe(401);
    });

    it('accepts when any v1 entry matches', async () => {
      const body = completedFile();
      const id = newId();
      const ts = String(now());
      const old = sign(body, id, ts, 'whsec_' + Buffer.from('previous-signing-key-0123456789ab').toString('base64'));
      const res = await post(body, signedHeaders(body, { id, timestamp: ts, signature: `${old} ${sign(body, id, ts)}` }));
      expect(res.status).toBe(200);
    });

    it('ignores other signature versions such as v1a', async () => {
      const body = completedFile();
      const id = newId();
      const ts = String(now());
      const res = await post(body, signedHeaders(body, { id, timestamp: ts, signature: sign(body, id, ts, SECRET, 'v1a') }));
      expect(res.status).toBe(401);
    });

    it('rejects a malformed signature header', async () => {
      const body = completedFile();
      const res = await post(body, signedHeaders(body, { signature: 'not-a-signature' }));
      expect(res.status).toBe(401);
    });

    it('rejects a signature for a different webhook-id', async () => {
      const body = completedFile();
      const ts = String(now());
      const res = await post(body, signedHeaders(body, { id: newId(), timestamp: ts, signature: sign(body, 'evt_other', ts) }));
      expect(res.status).toBe(401);
    });
  });

  describe('missing input', () => {
    it('returns 400 when headers are missing', async () => {
      const res = await post(completedFile(), { 'content-type': 'application/json' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when only some headers are present', async () => {
      const body = completedFile();
      const headers = signedHeaders(body);
      delete headers['webhook-signature'];
      const res = await post(body, headers);
      expect(res.status).toBe(400);
    });

    it('fails closed with 500 when the secret is not configured', async () => {
      delete process.env.GENERAL_TRANSLATION_WEBHOOK_SECRET;
      const body = completedFile();
      const res = await post(body, signedHeaders(body));
      expect(res.status).toBe(500);
    });
  });

  describe('retries', () => {
    it('acknowledges a redelivered event id as a duplicate', async () => {
      const body = completedFile();
      const first = await post(body, signedHeaders(body));
      const second = await post(body, signedHeaders(body));
      expect(await first.json()).toEqual({ received: true });
      expect(second.status).toBe(200);
      expect(await second.json()).toEqual({ received: true, duplicate: true });
    });
  });
});
