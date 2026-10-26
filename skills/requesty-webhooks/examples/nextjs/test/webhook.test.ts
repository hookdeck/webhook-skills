// Generated with: requesty-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/requesty/route';

// Requesty secrets are Standard Webhooks secrets: "whsec_" + base64(key bytes), for
// example "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw7Jxx2Oll+OE=". The HMAC key is
// the decoded part.
const SECRET = 'whsec_' + Buffer.from('requesty-test-signing-key-0123456789a').toString('base64');

/** Sign exactly like Requesty does: HMAC-SHA256 over `${id}.${timestamp}.${body}`. */
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
  event?: string;
  timestamp?: number | string;
  secret?: string;
  signature?: string;
}

/** Build signature headers. `prefix` is 'webhook' (Requesty) or 'svix' (fallback). */
function signedHeaders(rawBody: string, opts: SignOptions = {}): Record<string, string> {
  const prefix = opts.prefix ?? 'webhook';
  const id = opts.id || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(opts.timestamp ?? now());
  return {
    'content-type': 'application/json',
    'x-requesty-event': opts.event ?? 'org.balance.below_absolute',
    [`${prefix}-id`]: id,
    [`${prefix}-timestamp`]: ts,
    [`${prefix}-signature`]: opts.signature ?? sign(rawBody, id, ts, opts.secret),
  };
}

function post(rawBody: string, headers: Record<string, string>) {
  return POST(
    new Request('http://localhost:3000/webhooks/requesty', {
      method: 'POST',
      headers,
      body: rawBody,
    })
  );
}

const alert = (type: string, data: Record<string, unknown>, id: string = crypto.randomUUID()) => ({ id, type, data });

const orgBalance = (id?: string) =>
  alert('org.balance.below_absolute', { org_id: 'org_abc123', balance_threshold: '100', current_balance: '87.50' }, id);

const sampleRequest = () => ({
  request_id: 'req_123',
  request: { model: 'openai/gpt-4o', messages: [{ role: 'user', content: 'hello' }] },
  response: {
    id: 'chatcmpl_1',
    object: 'chat.completion',
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'Hi!' } }],
    usage: { prompt_tokens: 10, completion_tokens: 15, total_tokens: 25, cost: 0 },
  },
});

describe('Requesty webhook route', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.REQUESTY_WEBHOOK_SECRET = SECRET;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    process.env.REQUESTY_WEBHOOK_SECRET = SECRET;
  });

  describe('signature verification', () => {
    it('accepts a validly signed delivery with webhook-* headers', async () => {
      const raw = JSON.stringify(orgBalance());
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts the same delivery sent with svix-* headers', async () => {
      const raw = JSON.stringify(orgBalance());
      const res = await post(raw, signedHeaders(raw, { prefix: 'svix' }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('prefers webhook-* headers when both sets are present', async () => {
      const raw = JSON.stringify(orgBalance());
      const res = await post(raw, {
        ...signedHeaders(raw),
        'svix-id': 'msg_other',
        'svix-timestamp': String(now()),
        'svix-signature': 'v1,AAAA',
      });
      expect(res.status).toBe(200);
    });

    it('verifies the exact bytes, whatever the content type', async () => {
      const raw = '{"id":"a-1",  "type":"org.balance.below_absolute",\n"data":{"org_id":"o1","current_balance":"1"}}';
      const res = await post(raw, { ...signedHeaders(raw), 'content-type': 'text/plain' });
      expect(res.status).toBe(200);
    });

    it('accepts a delivery signed with several signatures when one is valid', async () => {
      const raw = JSON.stringify(orgBalance());
      const id = 'msg_multi';
      const ts = String(now());
      const bad = sign(raw, id, ts, 'whsec_' + Buffer.from('some-other-secret-value-0123456').toString('base64'));
      const res = await post(raw, signedHeaders(raw, { id, timestamp: ts, signature: `${bad} ${sign(raw, id, ts)}` }));
      expect(res.status).toBe(200);
    });

    it('ignores non-v1 signature entries', async () => {
      const raw = JSON.stringify(orgBalance());
      const id = 'msg_v1a';
      const ts = String(now());
      const res = await post(raw, signedHeaders(raw, { id, timestamp: ts, signature: sign(raw, id, ts).replace('v1,', 'v1a,') }));
      expect(res.status).toBe(400);
    });

    it('rejects a tampered body', async () => {
      const raw = JSON.stringify(orgBalance());
      const headers = signedHeaders(raw);
      const res = await post(raw.replace('87.50', '1.00'), headers);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid signature' });
    });

    it('rejects a signature made with another secret', async () => {
      const raw = JSON.stringify(orgBalance());
      const other = 'whsec_' + Buffer.from('another-organisation-secret-01').toString('base64');
      const res = await post(raw, signedHeaders(raw, { secret: other }));
      expect(res.status).toBe(400);
    });

    it('rejects a stale timestamp', async () => {
      const raw = JSON.stringify(orgBalance());
      const res = await post(raw, signedHeaders(raw, { timestamp: now() - 6 * 60 }));
      expect(res.status).toBe(400);
    });

    it('rejects a timestamp too far in the future', async () => {
      const raw = JSON.stringify(orgBalance());
      const res = await post(raw, signedHeaders(raw, { timestamp: now() + 6 * 60 }));
      expect(res.status).toBe(400);
    });

    it.each(['id', 'timestamp', 'signature'])('rejects a delivery missing webhook-%s', async (name) => {
      const raw = JSON.stringify(orgBalance());
      const headers = signedHeaders(raw);
      delete headers[`webhook-${name}`];
      const res = await post(raw, headers);
      expect(res.status).toBe(400);
    });

    it('rejects a delivery with no signature headers', async () => {
      const raw = JSON.stringify(orgBalance());
      const res = await post(raw, { 'content-type': 'application/json' });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Missing signature headers' });
    });

    it('fails closed when the secret is not configured', async () => {
      delete process.env.REQUESTY_WEBHOOK_SECRET;
      const raw = JSON.stringify(orgBalance());
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Webhook secret not configured' });
    });
  });

  describe('event handling', () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ['user.budget.exceeded_percent', { user_id: 'u1', user_email: 'alice@company.com', limit: '100', spend: '82.40', percentage_exceeded: '0.8' }],
      ['user.budget.exceeded_absolute', { user_id: 'u1', user_email: 'alice@company.com', spend: '50.35', absolute_exceeded: '50' }],
      ['group.budget.exceeded_percent', { group_id: 'g1', group_name: 'Engineering', group_admins: [{ email: 'admin@company.com' }], limit: '500', spend: '452.10', percentage_exceeded: '0.9' }],
      ['org.balance.below_absolute', { org_id: 'org_abc123', balance_threshold: '100', current_balance: '87.50' }],
      ['apikey.budget.exceeded_percent', { api_key_id: 'k1', api_key_name: 'production-key', limit: '100', spend: '82.40', percentage_exceeded: '0.8' }],
      ['apikey.budget.exceeded_absolute', { api_key_id: 'k1', api_key_name: 'production-key', spend: '50.35', absolute_exceeded: '50' }],
    ];

    it.each(cases)('handles the %s alert', async (type, data) => {
      const raw = JSON.stringify(alert(type, data));
      const res = await post(raw, signedHeaders(raw, { event: type }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
      expect(logSpy.mock.calls.flat().join('\n')).not.toContain('Unhandled');
    });

    it('handles a sample.request, which has no `type` in the body', async () => {
      const raw = JSON.stringify(sampleRequest());
      const res = await post(raw, signedHeaders(raw, { id: 'req_123', event: 'sample.request' }));
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Sampled request req_123 (model openai/gpt-4o, tokens 25)');
    });

    it('falls back to the body `type` when X-Requesty-Event is absent', async () => {
      const raw = JSON.stringify(orgBalance());
      const headers = signedHeaders(raw);
      delete headers['x-requesty-event'];
      const res = await post(raw, headers);
      expect(res.status).toBe(200);
      expect(logSpy.mock.calls.flat().join('\n')).toContain('balance $87.50 is below $100');
    });

    it('acknowledges event types it does not handle', async () => {
      const raw = JSON.stringify(alert('org.something.new', {}));
      const res = await post(raw, signedHeaders(raw, { event: 'org.something.new' }));
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Unhandled Requesty event type: org.something.new');
    });

    it('acknowledges a retry as a duplicate: same webhook-id, new timestamp and signature', async () => {
      const raw = JSON.stringify(orgBalance('alert-dedupe-1'));
      const first = await post(raw, signedHeaders(raw, { id: 'alert-dedupe-1' }));
      expect(await first.json()).toEqual({ received: true });

      const retry = await post(raw, signedHeaders(raw, { id: 'alert-dedupe-1', timestamp: now() + 30 }));
      expect(retry.status).toBe(200);
      expect(await retry.json()).toEqual({ received: true, duplicate: true });
    });
  });
});
