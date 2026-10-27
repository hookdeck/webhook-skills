const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.API_VIDEO_WEBHOOK_SECRET = 'sig_sec_test_secret_0000000000';

const { app, verifyApiVideoSignature } = require('../src/index');

const secret = process.env.API_VIDEO_WEBHOOK_SECRET;

// Published example from api.video's docs (byte-exact body, do not reformat)
const VECTOR = {
  secret: 'sig_sec_0000000000000000000000',
  body: '{"type":"video.encoding.quality.completed","emittedAt":"2021-01-29T15:46:25.217Z","videoId":"vi0000000000000000000000","liveStreamId":"li0000000000000000000000","encoding":"hls","quality":"720p"}',
  signature: '27a77d3a7fc626854886b5dbfae4e32c8b0170c1ea1b714c91ba77f1e7774e8c',
};

function sign(payload, key = secret) {
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

function post(payload, signature) {
  const req = request(app).post('/webhooks/api-video').set('Content-Type', 'application/json');
  if (signature !== undefined) req.set('X-Api-Video-Signature', signature);
  return req.send(payload);
}

describe('verifyApiVideoSignature', () => {
  it('accepts the published api.video test vector', () => {
    expect(verifyApiVideoSignature(Buffer.from(VECTOR.body), VECTOR.signature, VECTOR.secret)).toBe(true);
  });

  it('accepts a valid signature', () => {
    const body = Buffer.from('{"type":"video.source.recorded","videoId":"vi1"}');
    expect(verifyApiVideoSignature(body, sign(body), secret)).toBe(true);
  });

  it('accepts uppercase hex', () => {
    const body = Buffer.from('{"type":"video.source.recorded"}');
    expect(verifyApiVideoSignature(body, sign(body).toUpperCase(), secret)).toBe(true);
  });

  it('rejects missing or empty signature', () => {
    const body = Buffer.from('{}');
    expect(verifyApiVideoSignature(body, undefined, secret)).toBe(false);
    expect(verifyApiVideoSignature(body, '', secret)).toBe(false);
  });

  it('rejects wrong secret and tampered body', () => {
    const body = Buffer.from('{"type":"video.source.recorded"}');
    expect(verifyApiVideoSignature(body, sign(body, 'other'), secret)).toBe(false);
    expect(verifyApiVideoSignature(Buffer.from('{"type":"x"}'), sign(body), secret)).toBe(false);
  });

  it('rejects malformed signatures (length, alphabet, prefix)', () => {
    const body = Buffer.from('{}');
    const good = sign(body);
    expect(verifyApiVideoSignature(body, good.slice(0, 62), secret)).toBe(false);
    expect(verifyApiVideoSignature(body, good + '00', secret)).toBe(false);
    expect(verifyApiVideoSignature(body, 'z'.repeat(64), secret)).toBe(false);
    expect(verifyApiVideoSignature(body, `sha256=${good}`, secret)).toBe(false);
  });
});

describe('POST /webhooks/api-video', () => {
  it('accepts the published test vector', async () => {
    process.env.API_VIDEO_WEBHOOK_SECRET = VECTOR.secret;
    const res = await post(VECTOR.body, VECTOR.signature);
    process.env.API_VIDEO_WEBHOOK_SECRET = secret;
    expect(res.status).toBe(200);
  });

  it('returns 401 for missing signature', async () => {
    const res = await post('{"type":"video.source.recorded"}');
    expect(res.status).toBe(401);
  });

  it('returns 401 for invalid signature', async () => {
    const res = await post('{"type":"video.source.recorded"}', 'a'.repeat(64));
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
    const res = await post(payload, sign(payload));
    expect(res.status).toBe(200);
  });

  it('verifies bodies sent with other content types', async () => {
    const payload = '{"type":"video.source.recorded","videoId":"vi1"}';
    const res = await request(app)
      .post('/webhooks/api-video')
      .set('Content-Type', 'text/plain')
      .set('X-Api-Video-Signature', sign(payload))
      .send(payload);
    expect(res.status).toBe(200);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const payload = 'not json';
    const res = await post(payload, sign(payload));
    expect(res.status).toBe(400);
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
