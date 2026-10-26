import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/missive/route';

const SECRET = 'test_missive_validation_secret';

// Sign exactly as Missive does: 'sha256=' + hex(HMAC-SHA256(secret, raw body))
function sign(body: string, secret = SECRET): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

const payload = {
  rule: { id: '45408b30-aa3a-45n1-bh67-0a0cb8da9080', description: 'Notify elfs', type: 'label_change' },
  conversation: {
    id: '47a57b76-df42-4d8k-927x-80dbe5d87191',
    subject: 'Mordor GPS coordinates',
    shared_labels: [{ id: '146ff5c4-d5la-3b63-b994-76711fn790lq', name: 'Elfs' }],
    shared_label_names: 'Elfs',
  },
  latest_message: {
    id: '86ef8bb8-269c-4959-a4f0-213db4e67844',
    subject: 'Fwd: Mordor GPS coordinates',
    type: 'email',
  },
};
const body = JSON.stringify(payload);

function buildRequest(raw: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/webhooks/missive', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: raw,
  });
}

describe('Missive webhook', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    process.env.MISSIVE_WEBHOOK_SECRET = SECRET;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('accepts a valid signature and handles label_change', async () => {
    const res = await POST(buildRequest(body, { 'x-hook-signature': sign(body) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Label change on "Mordor GPS coordinates"'));
  });

  it('accepts uppercase hex after the prefix', async () => {
    const header = 'sha256=' + sign(body).slice(7).toUpperCase();
    const res = await POST(buildRequest(body, { 'x-hook-signature': header }));
    expect(res.status).toBe(200);
  });

  it('verifies any content type', async () => {
    const res = await POST(buildRequest(body, { 'content-type': 'text/plain', 'x-hook-signature': sign(body) }));
    expect(res.status).toBe(200);
  });

  it('acknowledges other rule types', async () => {
    const other = JSON.stringify({ ...payload, rule: { ...payload.rule, type: 'incoming_email' } });
    const res = await POST(buildRequest(other, { 'x-hook-signature': sign(other) }));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Unhandled Missive rule type: incoming_email'));
  });

  it('acknowledges a verified body without a rule (validation request)', async () => {
    const res = await POST(buildRequest('{}', { 'x-hook-signature': sign('{}') }));
    expect(res.status).toBe(200);
  });

  it('rejects a wrong secret', async () => {
    const res = await POST(buildRequest(body, { 'x-hook-signature': sign(body, 'other') }));
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const res = await POST(buildRequest(body.replace('Mordor', 'Gondor'), { 'x-hook-signature': sign(body) }));
    expect(res.status).toBe(401);
  });

  it('rejects a missing signature header', async () => {
    const res = await POST(buildRequest(body));
    expect(res.status).toBe(401);
  });

  it('rejects a bare hex signature without the sha256= prefix', async () => {
    const res = await POST(buildRequest(body, { 'x-hook-signature': sign(body).slice(7) }));
    expect(res.status).toBe(401);
  });

  it('rejects a signature of the wrong length', async () => {
    const res = await POST(buildRequest(body, { 'x-hook-signature': sign(body).slice(0, 39) }));
    expect(res.status).toBe(401);
  });

  it('rejects 64 characters that are not all hex', async () => {
    const res = await POST(buildRequest(body, { 'x-hook-signature': 'sha256=g' + sign(body).slice(8) }));
    expect(res.status).toBe(401);
  });

  it('rejects a valid signature followed by junk', async () => {
    const res = await POST(buildRequest(body, { 'x-hook-signature': sign(body) + 'zz' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid JSON with a valid signature', async () => {
    const bad = '{not json';
    const res = await POST(buildRequest(bad, { 'x-hook-signature': sign(bad) }));
    expect(res.status).toBe(400);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.MISSIVE_WEBHOOK_SECRET;
    const res = await POST(buildRequest(body, { 'x-hook-signature': sign(body) }));
    expect(res.status).toBe(500);
  });
});
