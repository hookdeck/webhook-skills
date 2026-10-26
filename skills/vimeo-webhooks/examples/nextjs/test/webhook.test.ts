import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const secret = 'test_secret_key';

// Set test environment variables before the route is used.
beforeAll(() => {
  process.env.VIMEO_WEBHOOK_SECRET = secret;
});

/** Generate a real Vimeo signature: lowercase hex HMAC-SHA256 of the raw body. */
function sign(payload: string, key: string = secret): string {
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

function payload(webhookType: string, data: Record<string, string>): string {
  return JSON.stringify({ webhook_type: webhookType, data, timestamp: 1644961452 });
}

async function send(body: string, signature?: string, contentType = 'application/json') {
  const { POST } = await import('../app/webhooks/vimeo/route');
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature !== undefined) headers['x-webhook-signature'] = signature;
  return POST(
    new NextRequest('http://localhost:3000/webhooks/vimeo', {
      method: 'POST',
      headers,
      body,
    })
  );
}

describe('POST /webhooks/vimeo', () => {
  it('returns 401 when the signature header is missing', async () => {
    const res = await send(payload('video-created', { video_uri: '/videos/1' }));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a wrong signature', async () => {
    const body = payload('video-created', { video_uri: '/videos/1' });
    const res = await send(body, sign(body, 'other_secret'));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a non-hex or wrong-length signature', async () => {
    const body = payload('video-created', { video_uri: '/videos/1' });
    for (const bad of ['not-hex', 'abcd', 'z'.repeat(64), sign(body) + '00']) {
      const res = await send(body, bad);
      expect(res.status).toBe(401);
    }
  });

  it('returns 401 when the body is modified after signing', async () => {
    const body = payload('video-created', { video_uri: '/videos/1' });
    const res = await send(body.replace('/videos/1', '/videos/2'), sign(body));
    expect(res.status).toBe(401);
  });

  const events: Array<[string, Record<string, string>]> = [
    ['video-created', { clip_uri: '/videos/1', video_uri: '/videos/1' }],
    ['video-deleted', { clip_uri: '/videos/1', video_uri: '/videos/1' }],
    ['video-transcode-playable', { clip_uri: '/videos/1', video_uri: '/videos/1' }],
    [
      'video-transcode-complete',
      { clip_uri: '/videos/1', video_uri: '/videos/1', version_uri: '/videos/1/versions/1' },
    ],
    [
      'video-upload-failed',
      { video_uri: '/videos/1', error_type: 'invalid-video-file', failure_cause: 'remote_unauthorized' },
    ],
    [
      'transcript-status-complete',
      {
        transcript_uri: '/videos/1/transcripts/abc',
        text_track_uri: '/videos/1/texttracks/2',
        transcript_status: 'completed',
        video_uri: '/videos/1',
      },
    ],
    ['live-event-started', { event_uri: '/live_events/9', clip_uri: '/videos/1', video_uri: '/videos/1' }],
    ['live-event-ended', { event_uri: '/live_events/9', clip_uri: '/videos/1', video_uri: '/videos/1' }],
  ];

  it.each(events)('accepts a signed %s event', async (type, data) => {
    const body = payload(type, data);
    const res = await send(body, sign(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts an uppercase-hex signature', async () => {
    const body = payload('video-deleted', { video_uri: '/videos/1' });
    const res = await send(body, sign(body).toUpperCase());
    expect(res.status).toBe(200);
  });

  it('verifies any content type', async () => {
    const body = payload('video-deleted', { video_uri: '/videos/1' });
    for (const type of ['text/plain', 'application/octet-stream']) {
      const res = await send(body, sign(body), type);
      expect(res.status).toBe(200);
    }
  });

  it('accepts unknown event types without error', async () => {
    const body = payload('live-event-updated', { event_uri: '/live_events/9' });
    const res = await send(body, sign(body));
    expect(res.status).toBe(200);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await send(body, sign(body), 'text/plain');
    expect(res.status).toBe(400);
  });
});
