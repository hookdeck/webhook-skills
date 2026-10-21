// Generated with: sendoso-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/sendoso/route';

// Sendoso (Svix) endpoint secrets are "whsec_" + base64. The HMAC key is the
// base64-DECODED part after "whsec_".
const SECRET = 'whsec_' + Buffer.from('sendoso-test-signing-key-0123456').toString('base64');


/** Sign exactly like Sendoso/Svix. */
function sign(rawBody: string, id: string, timestamp: string, secret = SECRET): string {
  const key = Buffer.from(secret.split('_')[1], 'base64');
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
}

function signedHeaders(
  rawBody: string,
  { id, timestamp, secret, signature }: SignOptions = {}
): Record<string, string> {
  const msgId = id || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(timestamp ?? now());
  return {
    'content-type': 'application/json',
    'svix-id': msgId,
    'svix-timestamp': ts,
    'svix-signature': signature ?? sign(rawBody, msgId, ts, secret),
  };
}

async function post(rawBody: string, headers: Record<string, string>) {
  const res = await POST(
    new Request('http://localhost:3000/webhooks/sendoso', {
      method: 'POST',
      headers,
      body: rawBody,
    })
  );
  return { status: res.status, body: await res.json() };
}

let counter = 0;
function statusChange(statusChangedAt = '2026-10-21T09:31:15Z') {
  counter += 1;
  return { send_gid: `gid://sendoso/Send/${1000 + counter}`, status_changed_at: statusChangedAt };
}

beforeEach(() => {
  process.env.SENDOSO_WEBHOOK_SECRET = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('valid signatures', () => {
  it('accepts a signed send status change', async () => {
    const payload = statusChange();
    const body = JSON.stringify(payload);
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining(payload.send_gid));
  });

  it('accepts when any one of several space-separated signatures matches', async () => {
    const body = JSON.stringify(statusChange());
    const headers = signedHeaders(body);
    headers['svix-signature'] = `v1,bm90LXRoZS1yaWdodC1zaWc= ${headers['svix-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('returns 200 without reprocessing duplicate svix-id deliveries', async () => {
    const body = JSON.stringify(statusChange());
    const id = 'msg_duplicate_test';
    const first = await post(body, signedHeaders(body, { id }));
    const second = await post(body, signedHeaders(body, { id }));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ received: true, duplicate: true });
  });

  it('acknowledges but ignores out-of-order (stale) updates for a send', async () => {
    const sendGid = 'gid://sendoso/Send/stale-check';
    const newer = JSON.stringify({ send_gid: sendGid, status_changed_at: '2026-10-21T10:00:00Z' });
    const older = JSON.stringify({ send_gid: sendGid, status_changed_at: '2026-10-21T09:00:00Z' });
    expect((await post(newer, signedHeaders(newer))).status).toBe(200);
    const res = await post(older, signedHeaders(older));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, stale: true });
  });
});

describe('invalid requests', () => {
  it('rejects missing signature headers with 400', async () => {
    const body = JSON.stringify(statusChange());
    const res = await post(body, { 'content-type': 'application/json' });
    expect(res.status).toBe(400);
  });

  it('rejects a bad signature', async () => {
    const body = JSON.stringify(statusChange());
    const res = await post(body, signedHeaders(body, { signature: 'v1,aW52YWxpZA==' }));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with a different endpoint secret', async () => {
    const other = 'whsec_' + Buffer.from('another-endpoint-secret-01234567').toString('base64');
    const body = JSON.stringify(statusChange());
    const res = await post(body, signedHeaders(body, { secret: other }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(statusChange());
    const headers = signedHeaders(body);
    const res = await post(body.replace('Send/', 'Send/9'), headers);
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp more than 5 minutes old', async () => {
    const body = JSON.stringify(statusChange());
    const res = await post(body, signedHeaders(body, { timestamp: now() - 600 }));
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp more than 5 minutes in the future', async () => {
    const body = JSON.stringify(statusChange());
    const res = await post(body, signedHeaders(body, { timestamp: now() + 600 }));
    expect(res.status).toBe(400);
  });

  it('rejects signatures keyed with the undecoded secret string', async () => {
    const body = JSON.stringify(statusChange());
    const id = 'msg_undecoded';
    const ts = String(now());
    const wrong = crypto
      .createHmac('sha256', SECRET.split('_')[1])
      .update(`${id}.${ts}.${body}`)
      .digest('base64');
    const res = await post(body, signedHeaders(body, { id, timestamp: ts, signature: `v1,${wrong}` }));
    expect(res.status).toBe(400);
  });

  it('rejects a verified payload without send_gid', async () => {
    const body = JSON.stringify({ status_changed_at: '2026-10-21T09:31:15Z' });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(400);
  });
});

describe('fail closed', () => {
  it('returns 500 when SENDOSO_WEBHOOK_SECRET is not set', async () => {
    delete process.env.SENDOSO_WEBHOOK_SECRET;
    const body = JSON.stringify(statusChange());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
  });
});
