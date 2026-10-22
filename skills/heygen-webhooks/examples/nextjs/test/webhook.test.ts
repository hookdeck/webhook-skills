import crypto from 'crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// HeyGen endpoint secrets look like whsec_... but are used whole as a UTF-8 HMAC key
const SECRET = 'whsec_k7x9m2testsecretval1';
process.env.HEYGEN_WEBHOOK_SECRET = SECRET;

import { POST } from '../app/webhooks/heygen/route';

function sign(body: string, secret: string | Buffer = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function event(type: string): string {
  return JSON.stringify({ event_type: type, event_data: { video_id: 'vid_xyz789' } });
}

function makeRequest(body: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/heygen', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('HeyGen webhook', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([
    'avatar_video.success',
    'avatar_video.fail',
    'video_translate.success',
    'video_translate.fail',
  ])('accepts a validly signed %s event', async (type) => {
    const body = event(type);
    const res = await POST(makeRequest(body, { signature: sign(body) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies regardless of content type', async () => {
    const body = event('avatar_video.success');
    const res = await POST(makeRequest(body, { signature: sign(body), 'content-type': 'text/plain' }));
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature header', async () => {
    const res = await POST(makeRequest(event('avatar_video.success')));
    expect(res.status).toBe(400);
  });

  it('rejects an invalid signature', async () => {
    const res = await POST(makeRequest(event('avatar_video.success'), { signature: 'a'.repeat(64) }));
    expect(res.status).toBe(400);
  });

  it('rejects a malformed (short) signature', async () => {
    const res = await POST(makeRequest(event('avatar_video.success'), { signature: 'abc' }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const res = await POST(
      makeRequest(event('avatar_video.fail'), { signature: sign(event('avatar_video.success')) })
    );
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with the secret stripped of whsec_', async () => {
    const body = event('avatar_video.success');
    const res = await POST(makeRequest(body, { signature: sign(body, SECRET.slice('whsec_'.length)) }));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with the base64-decoded secret (Standard Webhooks style)', async () => {
    const body = event('avatar_video.success');
    const key = Buffer.from(SECRET.slice('whsec_'.length), 'base64');
    const res = await POST(makeRequest(body, { signature: sign(body, key) }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, { signature: sign(body) }));
    expect(res.status).toBe(400);
  });

  it('acknowledges unknown event types', async () => {
    const body = event('instant_avatar.success');
    const res = await POST(makeRequest(body, { signature: sign(body) }));
    expect(res.status).toBe(200);
  });
});
