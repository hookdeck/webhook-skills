import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/pubnub/route';
import { eventTypeFromSchema, verifyPubNubRequest } from '../lib/verify-pubnub';

const SECRET = 'Bearer test_pubnub_secret_0123456789';

const SAMPLE_ITEMS: Record<string, Record<string, unknown>> = {
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

beforeAll(() => {
  process.env.PUBNUB_WEBHOOK_SECRET = SECRET;
  delete process.env.PUBNUB_WEBHOOK_HEADER; // default: Authorization
});

afterEach(() => {
  delete process.env.PUBNUB_WEBHOOK_HEADER;
});

function samplePayload(type = 'messages.pubsub.publish') {
  return {
    dataSchema: `pubnub.com/schemas/events/${type}?v=1.0.0`,
    data: [SAMPLE_ITEMS[type] ?? {}],
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/pubnub', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/pubnub', () => {
  describe('secret header verification', () => {
    it('accepts the exact header value, prefix included', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ authorization: SECRET }));
      expect(res.status).toBe(200);
    });

    it('compares the whole value: the bare secret without Bearer is rejected', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET.replace('Bearer ', '') }));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await POST(makeRequest({ Authorization: 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await POST(makeRequest({ Authorization: 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects everything when PUBNUB_WEBHOOK_SECRET is unset', () => {
      const headers = new Headers({ Authorization: SECRET });
      expect(verifyPubNubRequest(headers, '')).toBe(false);
      delete process.env.PUBNUB_WEBHOOK_SECRET;
      expect(verifyPubNubRequest(headers)).toBe(false);
      process.env.PUBNUB_WEBHOOK_SECRET = SECRET;
    });

    it('reads a custom header name from PUBNUB_WEBHOOK_HEADER', async () => {
      process.env.PUBNUB_WEBHOOK_HEADER = 'X-PubNub-Secret';
      const ok = await POST(makeRequest({ 'x-pubnub-secret': SECRET }));
      expect(ok.status).toBe(200);
      const wrongHeader = await POST(makeRequest({ Authorization: SECRET }));
      expect(wrongHeader.status).toBe(401);
    });
  });

  describe('body handling', () => {
    it('accepts any content type (text body)', async () => {
      const res = await POST(
        makeRequest({ Authorization: SECRET }, JSON.stringify(samplePayload()), 'text/plain')
      );
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 when dataSchema is missing', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }, JSON.stringify({ data: [] })));
      expect(res.status).toBe(400);
    });

    it('returns 400 for an array body', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('event type', () => {
    it('strips the prefix and version from dataSchema', () => {
      expect(eventTypeFromSchema('pubnub.com/schemas/events/messages.pubsub.publish?v=1.0.0')).toBe(
        'messages.pubsub.publish'
      );
      expect(eventTypeFromSchema('pubnub.com/schemas/events/presence.user.channel.joined?v=1.0.0')).toBe(
        'presence.user.channel.joined'
      );
      expect(eventTypeFromSchema('other.com/x?v=1')).toBeNull();
      expect(eventTypeFromSchema(undefined)).toBeNull();
    });

    it.each(Object.keys(SAMPLE_ITEMS))('handles %s', async (type) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ Authorization: SECRET }, JSON.stringify(samplePayload(type)))
      );
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown event types', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest(
          { Authorization: SECRET },
          JSON.stringify({ dataSchema: 'pubnub.com/schemas/events/something.new?v=1.0.0', data: [{}] })
        )
      );
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled event: something.new'))).toBe(true);
      spy.mockRestore();
    });
  });
});
