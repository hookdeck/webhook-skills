const request = require('supertest');

// Set test environment variables before importing the app
process.env.MIGHTY_NETWORKS_WEBHOOK_SECRET = 'mn_test_api_key_0123456789';

const app = require('../src/index');
const { verifyMightyNetworksRequest, normalizeEventType, seenEventIds } = require('../src/index');

const SECRET = process.env.MIGHTY_NETWORKS_WEBHOOK_SECRET;
const BEARER = `Bearer ${SECRET}`;

const EVENTS = [
  'MemberJoined', 'MemberLeft', 'MemberPurchased', 'MemberPurchaseRequested',
  'MemberSubscriptionRenewed', 'MemberSubscriptionCanceled', 'MemberPlanChanged',
  'MemberRemovedFromPlan', 'PostCreated', 'PostUpdated', 'CommentCreated', 'RsvpCreated',
  'EventCreated', 'EventCanceled', 'ReportedContentCreated'
];

let counter = 0;
function samplePayload(eventType = 'PostCreatedHook') {
  counter += 1;
  return {
    event_id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    event_timestamp: '2024-01-15T10:30:00Z',
    event_type: eventType,
    payload: { id: 12345, title: 'Example post title', space_id: 111 }
  };
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/mighty-networks')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Mighty Networks webhook endpoint', () => {
  beforeEach(() => seenEventIds.clear());

  describe('Authorization Bearer verification', () => {
    it('accepts the correct key', async () => {
      const res = await post().set('Authorization', BEARER);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the Bearer scheme case-insensitively', async () => {
      for (const scheme of ['bearer', 'BEARER', 'BeArEr']) {
        const res = await post(JSON.stringify(samplePayload())).set('Authorization', `${scheme} ${SECRET}`);
        expect(res.status).toBe(200);
      }
    });

    it('rejects a wrong key of the same length', async () => {
      const res = await post().set('Authorization', `Bearer ${'x'.repeat(SECRET.length)}`);
      expect(res.status).toBe(401);
    });

    it('rejects a key of a different length without throwing', async () => {
      const res = await post().set('Authorization', 'Bearer short');
      expect(res.status).toBe(401);
    });

    it('compares the key case-sensitively', async () => {
      const res = await post().set('Authorization', `Bearer ${SECRET.toUpperCase()}`);
      expect(res.status).toBe(401);
    });

    it('does not alter the key: extra whitespace fails', () => {
      expect(verifyMightyNetworksRequest({ authorization: `Bearer ${SECRET} ` })).toBe(false);
      expect(verifyMightyNetworksRequest({ authorization: `Bearer  ${SECRET}` })).toBe(false);
    });

    it('rejects a missing Authorization header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects the bare key without a scheme', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(401);
    });

    it('rejects a different scheme', async () => {
      const res = await post().set('Authorization', `Basic ${SECRET}`);
      expect(res.status).toBe(401);
    });

    it('rejects a key with non-ASCII characters without throwing', async () => {
      expect(verifyMightyNetworksRequest({ authorization: 'Bearer clé-secrète' })).toBe(false);
    });

    it('rejects everything when MIGHTY_NETWORKS_WEBHOOK_SECRET is unset', () => {
      expect(verifyMightyNetworksRequest({ authorization: BEARER }, '')).toBe(false);
      delete process.env.MIGHTY_NETWORKS_WEBHOOK_SECRET;
      expect(verifyMightyNetworksRequest({ authorization: BEARER })).toBe(false);
      process.env.MIGHTY_NETWORKS_WEBHOOK_SECRET = SECRET;
    });

    it('strips a leading "Bearer " from the configured secret', () => {
      expect(verifyMightyNetworksRequest({ authorization: BEARER }, `Bearer ${SECRET}`)).toBe(true);
      expect(verifyMightyNetworksRequest({ authorization: BEARER }, `bearer ${SECRET}`)).toBe(true);
    });

    it('rejects an empty bearer key', () => {
      expect(verifyMightyNetworksRequest({ authorization: 'Bearer ' }, 'Bearer ')).toBe(false);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain')
        .set('Authorization', BEARER);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set('Authorization', BEARER);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a JSON array', async () => {
      const res = await post('[]').set('Authorization', BEARER);
      expect(res.status).toBe(400);
    });

    it('returns 401 (not 400) for invalid JSON without a key', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('Events', () => {
    it.each(EVENTS)('handles %s sent as %sHook', async (name) => {
      const res = await post(JSON.stringify(samplePayload(`${name}Hook`)))
        .set('Authorization', BEARER);
      expect(res.status).toBe(200);
    });

    it('handles an event without the Hook suffix', async () => {
      const res = await post(JSON.stringify(samplePayload('MemberJoined'))).set('Authorization', BEARER);
      expect(res.status).toBe(200);
    });

    it('accepts events it has no handler for', async () => {
      const res = await post(JSON.stringify(samplePayload('GiftLeaderboardUpdatedHook')))
        .set('Authorization', BEARER);
      expect(res.status).toBe(200);
    });

    it('normalizes the Hook suffix', () => {
      expect(normalizeEventType('PostCreatedHook')).toBe('PostCreated');
      expect(normalizeEventType('PostCreated')).toBe('PostCreated');
      expect(normalizeEventType(undefined)).toBe('');
    });
  });

  describe('Idempotency', () => {
    it('acknowledges a repeated event_id without handling it again', async () => {
      const body = JSON.stringify(samplePayload('MemberJoinedHook'));
      const first = await post(body).set('Authorization', BEARER);
      const second = await post(body).set('Authorization', BEARER);
      expect(first.body).toEqual({ received: true });
      expect(second.status).toBe(200);
      expect(second.body).toEqual({ received: true, duplicate: true });
    });
  });

  describe('Health', () => {
    it('responds ok', async () => {
      const res = await request(app).get('/health');
      expect(res.body).toEqual({ status: 'ok' });
    });
  });
});
