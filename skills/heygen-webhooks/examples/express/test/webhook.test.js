const crypto = require('crypto');
const request = require('supertest');

// HeyGen endpoint secrets look like whsec_... but are used whole as a UTF-8 HMAC key
const SECRET = 'whsec_k7x9m2testsecretval1';
process.env.HEYGEN_WEBHOOK_SECRET = SECRET;

const app = require('../src/index');

function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function event(type, data = {}) {
  return JSON.stringify({ event_type: type, event_data: { video_id: 'vid_xyz789', ...data } });
}

describe('HeyGen webhook', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([
    'avatar_video.success',
    'avatar_video.fail',
    'video_translate.success',
    'video_translate.fail',
  ])('accepts a validly signed %s event', async (type) => {
    const body = event(type);
    const res = await request(app)
      .post('/webhooks/heygen')
      .set('Content-Type', 'application/json')
      .set('signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('verifies regardless of content type', async () => {
    const body = event('avatar_video.success');
    const res = await request(app)
      .post('/webhooks/heygen')
      .set('Content-Type', 'text/plain')
      .set('signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('accepts uppercase hex signatures', async () => {
    const body = event('avatar_video.success');
    const res = await request(app)
      .post('/webhooks/heygen')
      .set('Content-Type', 'application/json')
      .set('signature', sign(body).toUpperCase())
      .send(body);
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature header', async () => {
    const res = await request(app)
      .post('/webhooks/heygen')
      .set('Content-Type', 'application/json')
      .send(event('avatar_video.success'));
    expect(res.status).toBe(400);
  });

  it('rejects an invalid signature', async () => {
    const res = await request(app)
      .post('/webhooks/heygen')
      .set('Content-Type', 'application/json')
      .set('signature', 'a'.repeat(64))
      .send(event('avatar_video.success'));
    expect(res.status).toBe(400);
  });

  it('rejects a malformed (short) signature', async () => {
    const res = await request(app)
      .post('/webhooks/heygen')
      .set('Content-Type', 'application/json')
      .set('signature', 'abc')
      .send(event('avatar_video.success'));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = event('avatar_video.success');
    const res = await request(app)
      .post('/webhooks/heygen')
      .set('Content-Type', 'application/json')
      .set('signature', sign(body))
      .send(event('avatar_video.fail'));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with the secret stripped of whsec_', async () => {
    const body = event('avatar_video.success');
    const res = await request(app)
      .post('/webhooks/heygen')
      .set('Content-Type', 'application/json')
      .set('signature', sign(body, SECRET.slice('whsec_'.length)))
      .send(body);
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with the base64-decoded secret (Standard Webhooks style)', async () => {
    const body = event('avatar_video.success');
    const key = Buffer.from(SECRET.slice('whsec_'.length), 'base64');
    const sig = crypto.createHmac('sha256', key).update(body).digest('hex');
    const res = await request(app)
      .post('/webhooks/heygen')
      .set('Content-Type', 'application/json')
      .set('signature', sig)
      .send(body);
    expect(res.status).toBe(400);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await request(app)
      .post('/webhooks/heygen')
      .set('Content-Type', 'text/plain')
      .set('signature', sign(body))
      .send(body);
    expect(res.status).toBe(400);
  });

  it('acknowledges unknown event types', async () => {
    const body = event('instant_avatar.success');
    const res = await request(app)
      .post('/webhooks/heygen')
      .set('Content-Type', 'application/json')
      .set('signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });
});
