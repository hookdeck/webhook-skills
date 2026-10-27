// Generated with: outhire-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/outhire/route';

// Outhire secrets look like "whsec_" + base64(key bytes). The HMAC key is the
// decoded part after the prefix.
const SECRET = 'whsec_' + Buffer.from('outhire-test-signing-key-0123456').toString('base64');


/** Sign like Outhire does: HMAC-SHA256 over `${id}.${timestamp}.${body}`, base64. */
function sign(rawBody: string, id: string, timestamp: string, secret = SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`, 'utf8')
    .digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);

/** prefix is 'webhook' (what Outhire sends) or 'svix' (accepted as a fallback). */
interface SignOptions {
  id?: string;
  timestamp?: number | string;
  secret?: string;
  signature?: string;
  prefix?: 'webhook' | 'svix';
}

function signedHeaders(rawBody: string, opts: SignOptions = {}): Record<string, string> {
  const { id, timestamp, secret, signature, prefix = 'webhook' } = opts;
  const msgId = id || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(timestamp ?? now());
  return {
    'content-type': 'application/json',
    [`${prefix}-id`]: msgId,
    [`${prefix}-timestamp`]: ts,
    [`${prefix}-signature`]: signature ?? sign(rawBody, msgId, ts, secret),
  };
}

function post(rawBody: string, headers: Record<string, string>) {
  return POST(
    new Request('http://localhost:3000/webhooks/outhire', {
      method: 'POST',
      headers,
      body: rawBody,
    })
  );
}

const candidateApplied = () => ({
  event: 'candidate.applied',
  occurred_at: '2026-03-11T00:00:00.000Z',
  candidate: {
    id: 123,
    name: 'Jane Doe',
    email: 'jane@example.com',
    phone: '+61400000000',
    fit_score: 82,
    applied_at: '2026-03-11T00:00:00.000Z',
    resume_url: 'https://example.com/resume.pdf',
    resume_data: {},
    url: 'https://app.outhire.ai/leads/123',
  },
  job: { id: 456, title: 'Account Executive' },
  company: { id: 789 },
});

const stageChanged = () => ({
  event: 'candidate.stage_changed',
  occurred_at: '2026-03-11T00:00:00.000Z',
  candidate: {
    id: 123,
    public_id: 'cand_abc123',
    name: 'Jane Doe',
    email: 'jane@example.com',
    url: 'https://app.outhire.ai/leads/123',
  },
  job: { id: 456, title: 'Account Executive' },
  company: { id: 789 },
  stage_change: {
    previous_stage: 'applied',
    new_stage: 'interview',
    changed_by: 'user',
    changed_by_user_id: 'b1c2d3e4-0000-4000-8000-000000000000',
  },
});

const ping = () => ({
  event: 'webhook.ping',
  occurred_at: '2026-03-11T00:00:00.000Z',
  webhook: { id: 123, url: 'https://example.com/webhooks/outhire' },
});

beforeEach(() => {
  process.env.OUTHIRE_WEBHOOK_SECRET = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('valid signatures', () => {
  it('accepts candidate.applied', async () => {
    const body = JSON.stringify(candidateApplied());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('applied to job 456'));
  });

  it('accepts candidate.stage_changed', async () => {
    const body = JSON.stringify(stageChanged());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('applied -> interview'));
  });

  it('accepts webhook.ping', async () => {
    const body = JSON.stringify(ping());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Test ping'));
  });

  it('acknowledges unknown event types with 200', async () => {
    const body = JSON.stringify({ event: 'candidate.something_new', occurred_at: '2026-03-11T00:00:00.000Z' });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('verifies the exact bytes whatever the content type', async () => {
    const body = JSON.stringify(candidateApplied());
    const headers = { ...signedHeaders(body), 'content-type': 'application/vnd.api+json' };
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('accepts when any one of several space-separated signatures matches (rotation)', async () => {
    const body = JSON.stringify(candidateApplied());
    const headers = signedHeaders(body);
    headers['webhook-signature'] = `v1,bm90LXRoZS1yaWdodC1zaWc= ${headers['webhook-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('returns 200 for a repeated delivery with the same webhook-id', async () => {
    const body = JSON.stringify(candidateApplied());
    const id = `msg_retry_${Date.now()}`;
    const first = await post(body, signedHeaders(body, { id }));
    const second = await post(body, signedHeaders(body, { id }));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ received: true, duplicate: true });
  });
});

describe('svix-* header fallback', () => {
  it('accepts a delivery signed the same way but sent with svix-* headers', async () => {
    const body = JSON.stringify(candidateApplied());
    const res = await post(body, signedHeaders(body, { prefix: 'svix' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('rejects a bad signature sent with svix-* headers', async () => {
    const body = JSON.stringify(candidateApplied());
    const res = await post(body, signedHeaders(body, { prefix: 'svix', signature: 'v1,aW52YWxpZA==' }));
    expect(res.status).toBe(400);
  });

  it('prefers webhook-* headers when both prefixes are present', async () => {
    const body = JSON.stringify(candidateApplied());
    const headers = { ...signedHeaders(body), ...signedHeaders(body, { prefix: 'svix', signature: 'v1,aW52YWxpZA==' }) };
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });
});

describe('invalid requests', () => {
  it('rejects missing signature headers with 400', async () => {
    const body = JSON.stringify(candidateApplied());
    const res = await post(body, { 'content-type': 'application/json' });
    expect(res.status).toBe(400);
  });

  it('rejects partial signature headers with 400', async () => {
    const body = JSON.stringify(candidateApplied());
    const headers = signedHeaders(body);
    delete headers['webhook-signature'];
    const res = await post(body, headers);
    expect(res.status).toBe(400);
  });

  it('rejects a bad signature', async () => {
    const body = JSON.stringify(candidateApplied());
    const res = await post(body, signedHeaders(body, { signature: 'v1,aW52YWxpZA==' }));
    expect(res.status).toBe(400);
  });

  it("rejects a signature made with another webhook's secret", async () => {
    const other = 'whsec_' + Buffer.from('another-webhook-secret-012345678').toString('base64');
    const body = JSON.stringify(candidateApplied());
    const res = await post(body, signedHeaders(body, { secret: other }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(candidateApplied());
    const headers = signedHeaders(body);
    const res = await post(body.replace('Jane', 'Mallory'), headers);
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp outside the 5-minute tolerance', async () => {
    const body = JSON.stringify(candidateApplied());
    const res = await post(body, signedHeaders(body, { timestamp: now() - 600 }));
    expect(res.status).toBe(400);
  });

  it('rejects signatures keyed with the undecoded secret string', async () => {
    const body = JSON.stringify(candidateApplied());
    const id = 'msg_undecoded';
    const ts = String(now());
    const wrong = crypto
      .createHmac('sha256', SECRET.slice('whsec_'.length))
      .update(`${id}.${ts}.${body}`)
      .digest('base64');
    const res = await post(body, signedHeaders(body, { id, timestamp: ts, signature: `v1,${wrong}` }));
    expect(res.status).toBe(400);
  });
});

describe('fail closed', () => {
  it('returns 500 when OUTHIRE_WEBHOOK_SECRET is not set', async () => {
    delete process.env.OUTHIRE_WEBHOOK_SECRET;
    const body = JSON.stringify(candidateApplied());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
  });
});
