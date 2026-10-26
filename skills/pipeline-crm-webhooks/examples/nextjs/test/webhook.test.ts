// Generated with: pipeline-crm-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/pipeline-crm/route';

// Standard Webhooks secrets look like "whsec_" + base64(key bytes). The HMAC
// key is the decoded part.
const SECRET = 'whsec_' + Buffer.from('pipeline-crm-test-key-0123456789').toString('base64');

/** Sign exactly like Pipeline CRM does: HMAC-SHA256 over id.timestamp.body. */
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
  id?: string;
  timestamp?: number | string;
  secret?: string;
  signature?: string;
  contentType?: string;
}

function signedHeaders(rawBody: string, opts: SignOptions = {}): Record<string, string> {
  const id = opts.id || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(opts.timestamp ?? now());
  return {
    'content-type': opts.contentType || 'application/json',
    'webhook-id': id,
    'webhook-timestamp': ts,
    'webhook-signature': opts.signature ?? sign(rawBody, id, ts, opts.secret),
  };
}

function post(rawBody: string, headers: Record<string, string>) {
  return POST(
    new Request('http://localhost:3000/webhooks/pipeline-crm', {
      method: 'POST',
      headers,
      body: rawBody,
    })
  );
}

const payload = (model: string, action: string, extra: Record<string, unknown> = {}) => ({
  trigger: 'Deal stage changed',
  timestamp: '2026-09-03 14:22:07',
  event_model: model,
  event_action: action,
  event_model_id: 4521,
  event_data: { id: 4521, name: 'Acme Corporation - Q4 renewal', deal_stage_id: 4, value: 12000.0, user_id: 13 },
  caused_by_user: { id: 13, email: 'sam.okafor@northwind.example' },
  ...extra,
});

beforeEach(() => {
  process.env.PIPELINE_CRM_WEBHOOK_SECRET = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('valid signatures', () => {
  it('accepts deal.create', async () => {
    const body = JSON.stringify(payload('deal', 'create'));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Deal created: 4521'));
  });

  it('accepts deal.update and reports changed fields', async () => {
    const body = JSON.stringify(payload('deal', 'update', { event_changes: { deal_stage_id: [3, 4] } }));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('deal_stage_id'));
  });

  it('accepts person.create', async () => {
    const body = JSON.stringify(payload('person', 'create'));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Person created'));
  });

  it('accepts company.destroy', async () => {
    const body = JSON.stringify(payload('company', 'destroy'));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Company deleted'));
  });

  it('acknowledges unknown event types with 200', async () => {
    const body = JSON.stringify(payload('task', 'create'));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Unhandled Pipeline CRM event: task.create'));
  });

  it('verifies any content type (raw body, not JSON-parsed)', async () => {
    const body = JSON.stringify(payload('deal', 'create'));
    const res = await post(body, signedHeaders(body, { contentType: 'text/plain' }));
    expect(res.status).toBe(200);
  });

  it('accepts when any one of several space-separated signatures matches (rotation)', async () => {
    const body = JSON.stringify(payload('deal', 'create'));
    const headers = signedHeaders(body);
    headers['webhook-signature'] = `v1,bm90LXRoZS1yaWdodC1zaWc= ${headers['webhook-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('returns 200 for a retried delivery with the same webhook-id', async () => {
    const body = JSON.stringify(payload('deal', 'create'));
    const id = `msg_retry_${Date.now()}`;
    const first = await post(body, signedHeaders(body, { id }));
    const second = await post(body, signedHeaders(body, { id }));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ received: true, duplicate: true });
  });
});

describe('invalid requests', () => {
  it('rejects unsigned deliveries (no webhook-* headers) with 400', async () => {
    const body = JSON.stringify(payload('deal', 'create'));
    const res = await post(body, { 'content-type': 'application/json' });
    expect(res.status).toBe(400);
  });

  it('rejects a bad signature', async () => {
    const body = JSON.stringify(payload('deal', 'create'));
    const res = await post(body, signedHeaders(body, { signature: 'v1,aW52YWxpZA==' }));
    expect(res.status).toBe(400);
  });

  it("rejects a signature made with another endpoint's secret", async () => {
    const other = 'whsec_' + Buffer.from('another-endpoint-secret-01234567').toString('base64');
    const body = JSON.stringify(payload('deal', 'create'));
    const res = await post(body, signedHeaders(body, { secret: other }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(payload('deal', 'create'));
    const headers = signedHeaders(body);
    const res = await post(body.replace('12000', '99000'), headers);
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp outside the 5-minute tolerance', async () => {
    const body = JSON.stringify(payload('deal', 'create'));
    const res = await post(body, signedHeaders(body, { timestamp: now() - 600 }));
    expect(res.status).toBe(400);
  });

  it('rejects signatures keyed with the undecoded secret string', async () => {
    const body = JSON.stringify(payload('deal', 'create'));
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
  it('returns 500 when PIPELINE_CRM_WEBHOOK_SECRET is not set', async () => {
    delete process.env.PIPELINE_CRM_WEBHOOK_SECRET;
    const body = JSON.stringify(payload('deal', 'create'));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
  });
});
