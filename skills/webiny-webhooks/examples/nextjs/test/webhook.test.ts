// Generated with: webiny-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, afterEach } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/webiny/route';
import { verifyWebinyWebhook } from '../lib/verify';

// Webiny secrets are admin-entered free text; the HMAC key is their raw UTF-8 bytes.
const SECRET = 'my-webiny-signing-secret';
process.env.WEBINY_WEBHOOK_SECRET = SECRET;

/** Sign like Webiny: base64(HMAC-SHA256(key, `${id}.${timestamp}.${body}`)). */
function sign(body: string, id: string, timestamp: string | number, secret = SECRET): string {
  const key = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice(6), 'base64')
    : Buffer.from(secret, 'utf8');
  return crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
}

const now = () => Math.floor(Date.now() / 1000);
const envelope = {
  id: 'task-1',
  event: 'cms.entry.published',
  timestamp: new Date().toISOString(),
  webhookId: 'wh-1',
  deliveryId: 'del-1',
  tenant: 'root',
  data: { entryId: 'e1' },
};
const body = JSON.stringify(envelope);

interface Opts {
  prefix?: string;
  id?: string;
  timestamp?: string | number;
  secret?: string;
  signature?: string;
  contentType?: string;
}

function headersFor(rawBody: string, o: Opts = {}): Record<string, string> {
  const prefix = o.prefix ?? 'webhook';
  const id = o.id ?? `msg_${crypto.randomUUID()}`;
  const ts = o.timestamp ?? now();
  return {
    'content-type': o.contentType ?? 'application/json',
    [`${prefix}-id`]: id,
    [`${prefix}-timestamp`]: String(ts),
    [`${prefix}-signature`]: o.signature ?? `v1,${sign(rawBody, id, ts, o.secret)}`,
  };
}

const post = (rawBody: string, headers: Record<string, string>) =>
  POST(new NextRequest('http://localhost/webhooks/webiny', { method: 'POST', headers, body: rawBody }));

describe('Webiny webhook route', () => {
  afterEach(() => {
    process.env.WEBINY_WEBHOOK_SECRET = SECRET;
    delete process.env.WEBINY_WEBHOOK_TOLERANCE_SECONDS;
  });

  it('accepts a valid delivery', async () => {
    const res = await post(body, headersFor(body));
    expect(res.status).toBe(200);
    expect((await res.json()).received).toBe(true);
  });

  it('accepts a valid delivery with a non-JSON content type', async () => {
    const res = await post(body, headersFor(body, { contentType: 'text/plain' }));
    expect(res.status).toBe(200);
  });

  it('accepts the same signature sent with svix-* headers', async () => {
    const res = await post(body, headersFor(body, { prefix: 'svix' }));
    expect(res.status).toBe(200);
  });

  it('accepts a whsec_ secret as Standard Webhooks base64', async () => {
    const whsec = 'whsec_' + Buffer.from('another-key-bytes').toString('base64');
    process.env.WEBINY_WEBHOOK_SECRET = whsec;
    const res = await post(body, headersFor(body, { secret: whsec }));
    expect(res.status).toBe(200);
  });

  it('rejects a signature made with the base64-decoded free-text secret', async () => {
    const id = 'x';
    const ts = now();
    const wrong = crypto
      .createHmac('sha256', Buffer.from(SECRET, 'base64'))
      .update(`${id}.${ts}.${body}`)
      .digest('base64');
    const res = await post(body, headersFor(body, { id, timestamp: ts, signature: `v1,${wrong}` }));
    expect(res.status).toBe(400);
  });

  it('accepts when any v1 entry matches and ignores other versions', async () => {
    const id = 'msg_multi';
    const ts = now();
    const good = sign(body, id, ts);
    const signature = `v1a,${good} v1,${Buffer.from('bad').toString('base64')} v1,${good}`;
    const res = await post(body, headersFor(body, { id, timestamp: ts, signature }));
    expect(res.status).toBe(200);
  });

  it('rejects a delivery signed only with a non-v1 version', async () => {
    const id = 'msg_v1a';
    const ts = now();
    const res = await post(body, headersFor(body, { id, timestamp: ts, signature: `v1a,${sign(body, id, ts)}` }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const headers = headersFor(body);
    const res = await post(JSON.stringify({ ...envelope, data: { entryId: 'evil' } }), headers);
    expect(res.status).toBe(400);
  });

  it('rejects a signature from another secret', async () => {
    const res = await post(body, headersFor(body, { secret: 'someone-elses-secret' }));
    expect(res.status).toBe(400);
  });

  it('rejects missing headers', async () => {
    const res = await post(body, { 'content-type': 'application/json' });
    expect(res.status).toBe(400);
  });

  it('rejects a non-integer timestamp', async () => {
    for (const bad of ['1.5', '-5', '0', '12abc', '0123']) {
      const id = 'msg_bad_ts';
      const res = await post(body, headersFor(body, { id, timestamp: bad, signature: `v1,${sign(body, id, bad)}` }));
      expect(res.status).toBe(400);
    }
  });

  it('accepts an old timestamp by default (retries and replays)', async () => {
    const res = await post(body, headersFor(body, { timestamp: now() - 86400 }));
    expect(res.status).toBe(200);
  });

  it('rejects an old timestamp when WEBINY_WEBHOOK_TOLERANCE_SECONDS is set', async () => {
    process.env.WEBINY_WEBHOOK_TOLERANCE_SECONDS = '300';
    const res = await post(body, headersFor(body, { timestamp: now() - 3600 }));
    expect(res.status).toBe(400);
  });

  it('acknowledges a retried delivery as a duplicate', async () => {
    const headers = headersFor(body, { id: 'msg_dupe' });
    expect((await post(body, headers)).status).toBe(200);
    const again = await post(body, headers);
    expect(again.status).toBe(200);
    expect((await again.json()).duplicate).toBe(true);
  });

  it('fails closed (500) when the secret is not configured', async () => {
    delete process.env.WEBINY_WEBHOOK_SECRET;
    const res = await post(body, headersFor(body));
    expect(res.status).toBe(500);
  });

  it('never verifies with an empty key', () => {
    const headers = new Headers(headersFor(body));
    expect(verifyWebinyWebhook(Buffer.from(body), headers, 'whsec_').valid).toBe(false);
    expect(verifyWebinyWebhook(Buffer.from(body), headers, '').valid).toBe(false);
  });

  it('rejects invalid JSON that carries a valid signature', async () => {
    const bad = 'not json';
    const res = await post(bad, headersFor(bad));
    expect(res.status).toBe(400);
  });
});
