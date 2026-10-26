const request = require('supertest');

// Set test environment variables before importing the app
process.env.PUBNUB_WEBHOOK_SECRET = 'Bearer test_pubnub_secret_0123456789';
delete process.env.PUBNUB_WEBHOOK_HEADER; // default: Authorization

const app = require('../src/index');
const { verifyPubNubRequest, eventTypeFromSchema } = require('../src/index');

const SECRET = process.env.PUBNUB_WEBHOOK_SECRET;

const SAMPLE_ITEMS = {
  'messages.pubsub.publish': { channel: 'c', senderId: 'u', message: 'hi', timetoken: '1' },
  'messages.action.created': { channel: 'c', userId: 'u', type: 'reaction', value: '1' },
  'messages.action.deleted': { channel: 'c', userId: 'u', type: 'reaction', value: '1' },
  'presence.channel.user.state.in.changed': { channel: 'c', userId: 'u' },
  'presence.user.channel.joined': { channel: 'c', userId: 'u', occupancy: 2 },
  'presence.user.channel.left': { channel: 'c', userId: 'u', occupancy: 1 },
  'presence.user.timedout.in.channel': { channelId: 'c', userId: 'u', occupancy: 0 },
  'presence.channel.state.active': { channel: 'c' },
  'presence.channel.state.inactive': { channel: 'c' },
  'presence.channel.occupancy.counted': { channel: 'c', occupancy: 7 },
  'user.created': { userId: 'u', name: 'User' },
  'user.updated': { userId: 'u', name: 'User' },
  'user.deleted': { userId: 'u' },
  'channel.created': { channelId: 'c', name: 'c' },
  'channel.updated': { channelId: 'c', name: 'c' },
  'channel.deleted': { channelId: 'c' },
  'membership.created': { channelId: 'c', userId: 'u' },
  'membership.updated': { channelId: 'c', userId: 'u' },
  'membership.deleted': { channelId: 'c', userId: 'u' },
  'push.device.removed': { device: 'token', platform: 'ios' },
  'push.message.sending.failed': { channel: 'c', platform: 'apns', payload: 'too big' },
};

function samplePayload(type = 'messages.pubsub.publish') {
  return {
    dataSchema: `pubnub.com/schemas/events/${type}?v=1.0.0`,
    data: [SAMPLE_ITEMS[type] || {}],
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/pubnub')
    .set('Content-Type', contentType)
    .send(body);
}

describe('PubNub webhook endpoint', () => {
  describe('secret header verification', () => {
    it('accepts the exact header value, prefix included', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('compares the whole value: the bare secret without Bearer is rejected', async () => {
      const res = await post().set('Authorization', SECRET.replace('Bearer ', ''));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await post().set('Authorization', 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await post().set('Authorization', 'short');
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects everything when PUBNUB_WEBHOOK_SECRET is unset', () => {
      expect(verifyPubNubRequest({ authorization: SECRET }, '')).toBe(false);
      delete process.env.PUBNUB_WEBHOOK_SECRET;
      expect(verifyPubNubRequest({ authorization: SECRET })).toBe(false);
      process.env.PUBNUB_WEBHOOK_SECRET = SECRET;
    });

    it('reads a custom header name from PUBNUB_WEBHOOK_HEADER', async () => {
      process.env.PUBNUB_WEBHOOK_HEADER = 'X-PubNub-Secret';
      try {
        const ok = await post().set('x-pubnub-secret', SECRET);
        expect(ok.status).toBe(200);
        const wrongHeader = await post().set('Authorization', SECRET);
        expect(wrongHeader.status).toBe(401);
      } finally {
        delete process.env.PUBNUB_WEBHOOK_HEADER;
      }
    });

    it('handles non-ASCII header values without throwing', () => {
      expect(verifyPubNubRequest({ authorization: 'sécret-✓' }, 'secret')).toBe(false);
      expect(verifyPubNubRequest({ authorization: 'sécret-✓' }, 'sécret-✓')).toBe(true);
    });
  });

  describe('body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain')
        .set('Authorization', SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 when dataSchema is missing', async () => {
      const res = await post(JSON.stringify({ data: [] })).set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for an array body', async () => {
      const res = await post('[1,2]').set('Authorization', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('event type', () => {
    it('strips the prefix and version from dataSchema', () => {
      expect(eventTypeFromSchema('pubnub.com/schemas/events/messages.pubsub.publish?v=1.0.0'))
        .toBe('messages.pubsub.publish');
      expect(eventTypeFromSchema('pubnub.com/schemas/events/presence.user.channel.joined?v=1.0.0'))
        .toBe('presence.user.channel.joined');
      expect(eventTypeFromSchema('other.com/x?v=1')).toBeNull();
      expect(eventTypeFromSchema(undefined)).toBeNull();
    });

    it.each(Object.keys(SAMPLE_ITEMS))('handles %s', async (type) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload(type))).set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown event types', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify({
        dataSchema: 'pubnub.com/schemas/events/something.new?v=1.0.0',
        data: [{}],
      })).set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled event: something.new'))).toBe(true);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
