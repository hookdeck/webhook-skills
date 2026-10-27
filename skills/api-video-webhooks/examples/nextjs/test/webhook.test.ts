import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { verifyApiVideoSignature } from '../lib/verify';
import { POST } from '../app/webhooks/api-video/route';

const secret = 'sig_sec_test_secret_0000000000';

beforeAll(() => {
  process.env.API_VIDEO_WEBHOOK_SECRET = secret;
});

// Published example from api.video's docs (byte-exact body, do not reformat)
const VECTOR = {
  secret: 'sig_sec_0000000000000000000000',
  body: '{"type":"video.encoding.quality.completed","emittedAt":"2021-01-29T15:46:25.217Z","videoId":"vi0000000000000000000000","liveStreamId":"li0000000000000000000000","encoding":"hls","quality":"720p"}',
  signature: '27a77d3a7fc626854886b5dbfae4e32c8b0170c1ea1b714c91ba77f1e7774e8c',
};

function sign(payload: string, key = secret): string {
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

function makeRequest(body: string, signature?: string): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature !== undefined) headers['x-api-video-signature'] = signature;
  return new NextRequest('http://localhost:3000/webhooks/api-video', {
    method: 'POST',
    headers,
    body,
  });
}

describe('verifyApiVideoSignature', () => {
  it('accepts the published api.video test vector', () => {
    expect(verifyApiVideoSignature(Buffer.from(VECTOR.body), VECTOR.signature, VECTOR.secret)).toBe(true);
  });

  it('accepts a valid signature, including uppercase hex', () => {
    const body = Buffer.from('{"type":"video.source.recorded"}');
    expect(verifyApiVideoSignature(body, sign(body.toString()), secret)).toBe(true);
    expect(verifyApiVideoSignature(body, sign(body.toString()).toUpperCase(), secret)).toBe(true);
  });

  it('rejects missing or empty signature', () => {
    const body = Buffer.from('{}');
    expect(verifyApiVideoSignature(body, null, secret)).toBe(false);
    expect(verifyApiVideoSignature(body, '', secret)).toBe(false);
  });

  it('rejects wrong secret and tampered body', () => {
    const body = Buffer.from('{"type":"video.source.recorded"}');
    expect(verifyApiVideoSignature(body, sign(body.toString(), 'other'), secret)).toBe(false);
    expect(verifyApiVideoSignature(Buffer.from('{"type":"x"}'), sign(body.toString()), secret)).toBe(false);
  });

  it('rejects malformed signatures (length, alphabet, prefix)', () => {
    const body = Buffer.from('{}');
    const good = sign('{}');
    expect(verifyApiVideoSignature(body, good.slice(0, 62), secret)).toBe(false);
    expect(verifyApiVideoSignature(body, good + '00', secret)).toBe(false);
    expect(verifyApiVideoSignature(body, 'z'.repeat(64), secret)).toBe(false);
    expect(verifyApiVideoSignature(body, `sha256=${good}`, secret)).toBe(false);
  });
});

describe('POST /webhooks/api-video', () => {
  it('accepts the published test vector', async () => {
    process.env.API_VIDEO_WEBHOOK_SECRET = VECTOR.secret;
    const res = await POST(makeRequest(VECTOR.body, VECTOR.signature));
    process.env.API_VIDEO_WEBHOOK_SECRET = secret;
    expect(res.status).toBe(200);
  });

  it('returns 401 for missing signature', async () => {
    const res = await POST(makeRequest('{"type":"video.source.recorded"}'));
    expect(res.status).toBe(401);
  });

  it('returns 401 for invalid signature', async () => {
    const res = await POST(makeRequest('{"type":"video.source.recorded"}', 'a'.repeat(64)));
    expect(res.status).toBe(401);
  });

  it.each([
    ['video.encoding.quality.completed', { videoId: 'vi1', encoding: 'hls', quality: '720p' }],
    ['video.source.recorded', { videoId: 'vi1' }],
    ['live-stream.broadcast.started', { liveStreamId: 'li1' }],
    ['live-stream.broadcast.ended', { liveStreamId: 'li1' }],
    ['video.caption.generated', { videoId: 'vi1' }],
    ['video.summary.generated', { videoId: 'vi1' }],
    ['video.unknown.event', {}],
  ])('returns 200 for %s', async (type, fields) => {
    const payload = JSON.stringify({ type, emittedAt: '2021-01-29T15:46:25.217Z', ...fields });
    const res = await POST(makeRequest(payload, sign(payload)));
    expect(res.status).toBe(200);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const res = await POST(makeRequest('not json', sign('not json')));
    expect(res.status).toBe(400);
  });
});
