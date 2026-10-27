const crypto = require('crypto');
const request = require('supertest');

// Upload-Post secrets look like whsec_...; the whole string is the HMAC key
const SECRET = 'whsec_test_secret_key_123';
process.env.UPLOAD_POST_WEBHOOK_SECRET = SECRET;

const app = require('../src/index');

const nowTs = () => String(Math.floor(Date.now() / 1000));

function digest(body, timestamp, secret = SECRET) {
  const signed = Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from('.'), Buffer.from(body)]);
  return crypto.createHmac('sha256', secret).update(signed).digest('hex');
}

function send(body, { timestamp = nowTs(), signature, contentType = 'application/json' } = {}) {
  const req = request(app)
    .post('/webhooks/upload-post')
    .set('Content-Type', contentType)
    .set('X-Upload-Post-Timestamp', timestamp);
  const sig = signature === undefined ? `sha256=${digest(body, timestamp)}` : signature;
  if (sig !== null) req.set('X-Upload-Post-Signature', sig);
  return req.send(body);
}

// Payloads follow the documented samples
const comment = JSON.stringify({
  event: 'comment_received',
  user_email: 'user@example.com',
  profile_username: 'my-profile',
  platform: 'instagram',
  account_id: '17841461478253980',
  comment: { id: '17900000000000001', text: 'POST', parent_id: null, from: { id: '17841400000000002', username: 'a_follower' } },
  post: { id: '17900000000000003', media_product_type: 'REELS' },
  created_at: '2026-10-20T12:00:00.000000',
});
const connected = JSON.stringify({
  event: 'social_account_connected', user_email: 'user@example.com', platform: 'instagram',
  account_name: 'my_instagram_handle', status: 'connected', profile_username: 'your_profile_username',
  created_at: '2024-03-15T14:30:00.000000',
});
const disconnected = JSON.stringify({
  event: 'social_account_disconnected', user_email: 'user@example.com', platform: 'tiktok',
  account_name: 'my_tiktok_handle', status: 'disconnected', profile_username: 'your_profile_username',
  reason: 'manual_disconnect', created_at: '2024-03-15T14:30:00.000000',
});
const reauth = JSON.stringify({
  event: 'social_account_reauth_required', user_email: 'user@example.com', platform: 'youtube',
  account_name: 'UCxxxxxxxxx', status: 'reauth_required', reason: 'token_refresh_threshold_exceeded',
  created_at: '2024-03-15T14:30:00.000000',
});
// upload_completed is not in the documented samples; only `event` and `user_email` are asserted
const uploaded = JSON.stringify({ event: 'upload_completed', user_email: 'user@example.com' });

describe('Upload-Post webhook', () => {
  beforeEach(() => {
    delete process.env.UPLOAD_POST_WEBHOOK_TOLERANCE_SECONDS;
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['comment_received', comment],
    ['social_account_connected', connected],
    ['social_account_disconnected', disconnected],
    ['social_account_reauth_required', reauth],
    ['upload_completed', uploaded],
  ])('accepts a signed %s event', async (_name, body) => {
    const res = await send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('logs unhandled events and returns 200', async () => {
    const res = await send(JSON.stringify({ event: 'something_new' }));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith('Unhandled event: something_new');
  });

  it('accepts a bare digest without the sha256= prefix', async () => {
    const ts = nowTs();
    expect((await send(connected, { timestamp: ts, signature: digest(connected, ts) })).status).toBe(200);
  });

  it('accepts an uppercase hex digest', async () => {
    const ts = nowTs();
    expect((await send(connected, { timestamp: ts, signature: `sha256=${digest(connected, ts).toUpperCase()}` })).status).toBe(200);
  });

  it('verifies the exact bytes, including non-ASCII and non-JSON content types', async () => {
    const body = JSON.stringify({ event: 'comment_received', comment: { text: 'héllo 🎉' } });
    expect((await send(body, { contentType: 'text/plain' })).status).toBe(200);
  });

  it('uses the whole whsec_ secret as the key (not base64-decoded, not stripped)', async () => {
    const ts = nowTs();
    const stripped = digest(connected, ts, SECRET.slice('whsec_'.length));
    const decoded = digest(connected, ts, Buffer.from(SECRET.slice('whsec_'.length), 'base64').toString('latin1'));
    expect((await send(connected, { timestamp: ts, signature: `sha256=${stripped}` })).status).toBe(401);
    expect((await send(connected, { timestamp: ts, signature: `sha256=${decoded}` })).status).toBe(401);
  });

  it('rejects a missing signature', async () => {
    expect((await send(connected, { signature: null })).status).toBe(401);
  });

  it('rejects an empty signature', async () => {
    expect((await send(connected, { signature: '' })).status).toBe(401);
  });

  it('rejects a missing timestamp header', async () => {
    const res = await request(app)
      .post('/webhooks/upload-post')
      .set('Content-Type', 'application/json')
      .set('X-Upload-Post-Signature', `sha256=${digest(connected, nowTs())}`)
      .send(connected);
    expect(res.status).toBe(401);
  });

  it.each([
    ['too short', 'sha256=abc123'],
    ['non-hex characters', `sha256=${'z'.repeat(64)}`],
    ['too long', `sha256=${'a'.repeat(66)}`],
    ['prefix only', 'sha256='],
  ])('rejects a malformed signature (%s)', async (_name, signature) => {
    expect((await send(connected, { signature })).status).toBe(401);
  });

  it('rejects a signature from the wrong secret', async () => {
    const ts = nowTs();
    expect((await send(connected, { timestamp: ts, signature: `sha256=${digest(connected, ts, 'whsec_other')}` })).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const ts = nowTs();
    const sig = `sha256=${digest(connected, ts)}`;
    const res = await request(app)
      .post('/webhooks/upload-post')
      .set('Content-Type', 'application/json')
      .set('X-Upload-Post-Timestamp', ts)
      .set('X-Upload-Post-Signature', sig)
      .send(connected.replace('instagram', 'tiktok'));
    expect(res.status).toBe(401);
  });

  it('rejects a timestamp that was not the one signed', async () => {
    const ts = nowTs();
    const res = await send(connected, { timestamp: String(Number(ts) + 1), signature: `sha256=${digest(connected, ts)}` });
    expect(res.status).toBe(401);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    expect((await send('not json')).status).toBe(400);
  });

  describe('timestamp tolerance', () => {
    const oldTs = String(Math.floor(Date.now() / 1000) - 3600);

    it('accepts old timestamps by default (Hookdeck retries and replays)', async () => {
      expect((await send(connected, { timestamp: oldTs })).status).toBe(200);
    });

    it('rejects old timestamps when UPLOAD_POST_WEBHOOK_TOLERANCE_SECONDS is set', async () => {
      process.env.UPLOAD_POST_WEBHOOK_TOLERANCE_SECONDS = '300';
      expect((await send(connected, { timestamp: oldTs })).status).toBe(401);
    });

    it('accepts fresh timestamps when a tolerance is set', async () => {
      process.env.UPLOAD_POST_WEBHOOK_TOLERANCE_SECONDS = '300';
      expect((await send(connected)).status).toBe(200);
    });

    it('treats 0 as off', async () => {
      process.env.UPLOAD_POST_WEBHOOK_TOLERANCE_SECONDS = '0';
      expect((await send(connected, { timestamp: oldTs })).status).toBe(200);
    });
  });
});
