const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing the app.
process.env.VIMEO_WEBHOOK_SECRET = 'test_secret_key';

const app = require('../src/index');

const secret = process.env.VIMEO_WEBHOOK_SECRET;

/** Generate a real Vimeo signature: lowercase hex HMAC-SHA256 of the raw body. */
function sign(payload, key = secret) {
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

function payload(webhookType, data) {
  return JSON.stringify({ webhook_type: webhookType, data, timestamp: 1644961452 });
}

function send(body, signature, contentType = 'application/json') {
  const req = request(app).post('/webhooks/vimeo').set('Content-Type', contentType);
  if (signature !== undefined) req.set('X-Webhook-Signature', signature);
  return req.send(body);
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
    for (const bad of ['not-hex', 'abcd', 'z'.repeat(64), sign(body) + '00', 'é'.repeat(64)]) {
      const res = await send(body, bad);
      expect(res.status).toBe(401);
    }
  });

  it('returns 401 when the body is modified after signing', async () => {
    const body = payload('video-created', { video_uri: '/videos/1' });
    const res = await send(body.replace('/videos/1', '/videos/2'), sign(body));
    expect(res.status).toBe(401);
  });

  it.each([
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
  ])('accepts a signed %s event', async (type, data) => {
    const body = payload(type, data);
    const res = await send(body, sign(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts an uppercase-hex signature', async () => {
    const body = payload('video-deleted', { video_uri: '/videos/1' });
    const res = await send(body, sign(body).toUpperCase());
    expect(res.status).toBe(200);
  });

  it('verifies any content type (express.raw type */*)', async () => {
    const body = payload('video-deleted', { video_uri: '/videos/1' });
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'application/octet-stream']) {
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

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
