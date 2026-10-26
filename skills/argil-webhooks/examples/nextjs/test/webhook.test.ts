// Generated with: argil-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/argil/route';

// Argil secrets look like "whsec_" + base64(key bytes), for example
// "whsec_C2FVsBQIhrscChlQIMV+b5sSYspob7oD". The HMAC key is the decoded part.
const SECRET = 'whsec_' + Buffer.from('argil-test-signing-key-0123456789').toString('base64');

/** Sign exactly like Argil does (Standard Webhooks). */
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
}

function signedHeaders(rawBody: string, opts: SignOptions = {}): Record<string, string> {
  const id = opts.id || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(opts.timestamp ?? now());
  return {
    'content-type': 'application/json',
    'webhook-id': id,
    'webhook-timestamp': ts,
    'webhook-signature': opts.signature ?? sign(rawBody, id, ts, opts.secret),
  };
}

function post(rawBody: string, headers: Record<string, string>) {
  return POST(
    new Request('http://localhost:3000/webhooks/argil', {
      method: 'POST',
      headers,
      body: rawBody,
    })
  );
}

const videoSuccess = () => ({
  event: 'VIDEO_GENERATION_SUCCESS',
  data: {
    videoId: 'vid_123',
    videoName: 'Product intro',
    videoUrl: 'https://example.com/video.mp4',
    message: 'Video generated',
    extras: {},
    renderCost: 10,
    renderCostRefunded: 0,
  },
});

beforeEach(() => {
  process.env.ARGIL_WEBHOOK_SECRET = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('valid signatures', () => {
  it('accepts VIDEO_GENERATION_SUCCESS', async () => {
    const body = JSON.stringify(videoSuccess());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Video ready: vid_123'));
  });

  it('accepts VIDEO_GENERATION_FAILED', async () => {
    const body = JSON.stringify({
      event: 'VIDEO_GENERATION_FAILED',
      data: { videoId: 'vid_9', videoName: 'x', message: 'render error', extras: {}, renderCost: 10, renderCostRefunded: 10 },
    });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Video failed: vid_9'));
  });

  it('accepts AVATAR_TRAINING_SUCCESS', async () => {
    const body = JSON.stringify({
      event: 'AVATAR_TRAINING_SUCCESS',
      data: { avatarId: 'avt_1', avatarName: 'Alex', extras: {} },
    });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Avatar trained: avt_1'));
  });

  it('accepts AVATAR_TRAINING_FAILED', async () => {
    const body = JSON.stringify({
      event: 'AVATAR_TRAINING_FAILED',
      data: { avatarId: 'avt_2', avatarName: 'Sam', extras: {} },
    });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Avatar training failed: avt_2'));
  });

  it('acknowledges unknown event names with 200', async () => {
    const body = JSON.stringify({ event: 'SOMETHING_NEW', data: {} });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('verifies bodies sent with any content type', async () => {
    const body = JSON.stringify(videoSuccess());
    const res = await post(body, { ...signedHeaders(body), 'content-type': 'text/plain' });
    expect(res.status).toBe(200);
  });

  it('accepts when any one of several space-separated signatures matches', async () => {
    const body = JSON.stringify(videoSuccess());
    const headers = signedHeaders(body);
    headers['webhook-signature'] = `v1,bm90LXRoZS1yaWdodC1zaWc= ${headers['webhook-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('returns 200 for a retried delivery with the same webhook-id', async () => {
    const body = JSON.stringify(videoSuccess());
    const id = `msg_retry_${Date.now()}`;
    const first = await post(body, signedHeaders(body, { id }));
    const second = await post(body, signedHeaders(body, { id }));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ received: true, duplicate: true });
  });
});

describe('invalid requests', () => {
  it('rejects an unsigned delivery (webhook created before signing) with 400', async () => {
    const body = JSON.stringify(videoSuccess());
    const res = await post(body, { 'content-type': 'application/json' });
    expect(res.status).toBe(400);
  });

  it('rejects a bad signature', async () => {
    const body = JSON.stringify(videoSuccess());
    const res = await post(body, signedHeaders(body, { signature: 'v1,aW52YWxpZA==' }));
    expect(res.status).toBe(400);
  });

  it("rejects a signature made with another webhook's secret", async () => {
    const other = 'whsec_' + Buffer.from('another-webhook-secret-0123456789').toString('base64');
    const body = JSON.stringify(videoSuccess());
    const res = await post(body, signedHeaders(body, { secret: other }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(videoSuccess());
    const headers = signedHeaders(body);
    const res = await post(body.replace('vid_123', 'vid_999'), headers);
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp outside the library 5-minute window', async () => {
    const body = JSON.stringify(videoSuccess());
    const res = await post(body, signedHeaders(body, { timestamp: now() - 600 }));
    expect(res.status).toBe(400);
  });

  it('rejects signatures keyed with the undecoded secret string', async () => {
    const body = JSON.stringify(videoSuccess());
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
  it('returns 500 when ARGIL_WEBHOOK_SECRET is not set', async () => {
    delete process.env.ARGIL_WEBHOOK_SECRET;
    const body = JSON.stringify(videoSuccess());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
  });
});
