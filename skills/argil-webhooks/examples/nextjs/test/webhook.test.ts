// Generated with: argil-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/argil/route';

// Argil secrets look like "whsec_" + base64(key bytes), for example
// "whsec_C2FVsBQIhrscChlQIMV+b5sSYspob7oD". The HMAC key is the decoded part.
const SECRET = 'whsec_' + Buffer.from('argil-test-signing-key-0123456789').toString('base64');

/** Sign per Standard Webhooks: base64(HMAC-SHA256(key, `${id}.${ts}.${body}`)). */
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
  prefix?: string;
}

function signedHeaders(rawBody: string, opts: SignOptions = {}): Record<string, string> {
  const id = opts.id || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(opts.timestamp ?? now());
  const prefix = opts.prefix ?? 'webhook';
  return {
    'content-type': 'application/json',
    [`${prefix}-id`]: id,
    [`${prefix}-timestamp`]: ts,
    [`${prefix}-signature`]: opts.signature ?? sign(rawBody, id, ts, opts.secret),
  };
}

function post(rawBody: string, headers: Record<string, string>) {
  return POST(
    new Request('http://localhost:3000/webhooks/argil', { method: 'POST', headers, body: rawBody })
  );
}

const videoSuccess = () => ({
  event: 'VIDEO_GENERATION_SUCCESS',
  data: {
    videoId: 'vid_123',
    videoName: 'Launch teaser',
    videoUrl: 'https://cdn.argil.ai/videos/vid_123.mp4',
    message: 'Video generation completed successfully',
    extras: { campaign: 'spring' },
    renderCost: 150,
    renderCostRefunded: false,
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
      data: {
        videoId: 'vid_124',
        videoName: 'Launch teaser',
        message: 'Render crashed',
        extras: {},
        renderCost: 150,
        renderCostRefunded: true,
      },
    });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Render crashed'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('refunded true'));
  });

  it('accepts AVATAR_TRAINING_SUCCESS', async () => {
    const body = JSON.stringify({
      event: 'AVATAR_TRAINING_SUCCESS',
      data: { avatarId: 'av_1', voiceId: 'vo_1', avatarName: 'Sam', extras: {} },
    });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Avatar trained: av_1'));
  });

  it('accepts AVATAR_TRAINING_FAILED', async () => {
    const body = JSON.stringify({
      event: 'AVATAR_TRAINING_FAILED',
      data: { avatarId: 'av_2', avatarName: 'Sam', extras: {} },
    });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Avatar training failed: av_2'));
  });

  it('acknowledges unknown events with 200', async () => {
    const body = JSON.stringify({ event: 'SOMETHING_NEW', data: {} });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Unhandled Argil event'));
  });

  it('accepts a delivery with svix-* headers when webhook-* are absent', async () => {
    const body = JSON.stringify(videoSuccess());
    const res = await post(body, signedHeaders(body, { prefix: 'svix' }));
    expect(res.status).toBe(200);
  });

  it('accepts when any one of several space-separated signatures matches', async () => {
    const body = JSON.stringify(videoSuccess());
    const headers = signedHeaders(body);
    headers['webhook-signature'] = `v1,bm90LXRoZS1yaWdodC1zaWc= ${headers['webhook-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('returns 200 duplicate for a retried delivery with the same webhook-id', async () => {
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
  it('rejects missing signature headers with 400 and the recreate hint', async () => {
    const body = JSON.stringify(videoSuccess());
    const res = await post(body, { 'content-type': 'application/json' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/[Rr]ecreate the webhook/);
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

  it('rejects a timestamp outside the 5-minute tolerance', async () => {
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
