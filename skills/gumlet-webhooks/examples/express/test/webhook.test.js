const request = require('supertest');

// Set test environment variables before importing the app
process.env.GUMLET_WEBHOOK_SECRET = 'test_gumlet_secret_0123456789';

const app = require('../src/index');
const { verifyGumletRequest } = require('../src/index');

const SECRET = process.env.GUMLET_WEBHOOK_SECRET;

const EVENTS = [
  'video.status.created', 'video.status.stream_ready', 'video.status.downloaded',
  'video.status.processed', 'video.status.ready', 'video.status.errored',
  'video.status.deleted', 'video.status.repackaged',
  'live.video.status.created', 'live.video.status.preparing', 'live.video.status.ready',
  'live.video.status.connected', 'live.video.status.active',
  'live.video.status.disconnected', 'live.video.status.complete',
  'event.video.uploaded', 'event.video.updated', 'event.embed.viewed',
  'event.embed.cta_clicked', 'event.embed.form_submitted', 'event.playlist.created',
  'event.playlist.asset', 'event.playlist.deleted', 'event.comment.all',
  'event.channel.member_joined'
];

// Based on the documented video.status.ready sample.
function samplePayload(type = 'video.status.ready') {
  return {
    input: {
      source_url: 'http://devimages.apple.com/iphone/samples/bipbop/bipbopall.m3u8',
      transformations: { format: 'abr', resolution: ['360p', '480p', '720p', '1080p'] },
      profile_id: '646df1c9173a4a2fcac180b7',
      width: 1920,
      height: 1080
    },
    output: {
      format: 'abr',
      playback_url: 'https://video.gumlet.io/646df1c9173a4a2fcac180b4/65b168a6e99b77f116c0e488/main.m3u8',
      download_url: 'https://video.gumlet.io/646df1c9173a4a2fcac180b4/65b168a6e99b77f116c0e488/download.mp4'
    },
    type,
    status: type.split('.').pop(),
    asset_id: '65b168a6e99b77f116c0e488',
    created_at: 1706125479006,
    tag: ['ball'],
    title: 'Example Title',
    description: 'some description'
  };
}

// Based on the documented live.video.status.complete sample.
const LIVE_COMPLETE = {
  input: {
    live_video_source_id: '68678418fc386bd77fd5c689',
    resolution: ['360p', '480p', '720p', '1080p'],
    title: 'Live stream at 04:25:38 on 2nd September'
  },
  output: {
    playback_url: 'https://video.gumlet.io/68678418fc386bd77fd5c689/68b671c1373a93b5103e1f9a/master.m3u8',
    embed_url: 'https://play.gumlet.io/embed/live/68b671c1373a93b5103e1f9a',
    storage_size: 0,
    duration: 0,
    recording_playback_url: 'https://video.gumlet.io/68678419fc386bd77fd5c69c/68b671c1373a93b5103e1f9c/main.m3u8'
  },
  type: 'live.video.status.complete',
  status: 'complete',
  live_asset_id: '68b671c1373a93b5103e1f9a',
  created_at: 1756787138405,
  updated_at: 1756787392403,
  recording_asset_id: '68b671c1373a93b5103e1f9c',
  vod_collection_id: '68678419fc386bd77fd5c69c'
};

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/gumlet')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Gumlet webhook endpoint', () => {
  describe('x-gumlet-token verification', () => {
    it('accepts the correct token', async () => {
      const res = await post().set('x-gumlet-token', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('X-Gumlet-Token', SECRET);
      expect(res.status).toBe(200);
    });

    it('rejects a wrong token of the same length', async () => {
      const res = await post().set('x-gumlet-token', 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a token of a different length without throwing', async () => {
      const res = await post().set('x-gumlet-token', 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a token that only starts with the secret (whole value is compared)', async () => {
      const res = await post().set('x-gumlet-token', `${SECRET}-extra`);
      expect(res.status).toBe(401);
    });

    it('rejects a missing token', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects everything when GUMLET_WEBHOOK_SECRET is unset', () => {
      expect(verifyGumletRequest({ 'x-gumlet-token': SECRET }, '')).toBe(false);
      delete process.env.GUMLET_WEBHOOK_SECRET;
      expect(verifyGumletRequest({ 'x-gumlet-token': SECRET })).toBe(false);
      process.env.GUMLET_WEBHOOK_SECRET = SECRET;
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain')
        .set('x-gumlet-token', SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set('x-gumlet-token', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await post('[1,2]').set('x-gumlet-token', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without a token', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (type) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload(type))).set('x-gumlet-token', SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('handles the documented live.video.status.complete payload', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(LIVE_COMPLETE)).set('x-gumlet-token', SECRET);
      expect(res.status).toBe(200);
      expect(spy).toHaveBeenCalledWith('Live stream complete: 68b671c1373a93b5103e1f9a');
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload('something.new'))).set('x-gumlet-token', SECRET);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
