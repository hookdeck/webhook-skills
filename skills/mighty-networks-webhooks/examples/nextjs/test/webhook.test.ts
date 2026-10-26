import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/mighty-networks/route';
import { normalizeEventType, verifyMightyNetworksRequest } from '../lib/verify-mighty-networks';

const SECRET = 'mn_test_api_key_0123456789';
const BEARER = `Bearer ${SECRET}`;

const EVENTS = [
  'MemberJoined', 'MemberLeft', 'MemberPurchased', 'MemberPurchaseRequested',
  'MemberSubscriptionRenewed', 'MemberSubscriptionCanceled', 'MemberPlanChanged',
  'MemberRemovedFromPlan', 'PostCreated', 'PostUpdated', 'CommentCreated', 'RsvpCreated',
  'EventCreated', 'EventCanceled', 'ReportedContentCreated',
];

beforeAll(() => {
  process.env.MIGHTY_NETWORKS_WEBHOOK_SECRET = SECRET;
});

let counter = 0;
function samplePayload(eventType = 'PostCreatedHook') {
  counter += 1;
  return {
    event_id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    event_timestamp: '2024-01-15T10:30:00Z',
    event_type: eventType,
    payload: { id: 12345, title: 'Example post title', space_id: 111 },
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/mighty-networks', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/mighty-networks', () => {
  describe('Authorization Bearer verification', () => {
    it('accepts the correct key', async () => {
      const res = await POST(makeRequest({ Authorization: BEARER }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the Bearer scheme case-insensitively', async () => {
      for (const scheme of ['bearer', 'BEARER', 'BeArEr']) {
        const res = await POST(makeRequest({ Authorization: `${scheme} ${SECRET}` }));
        expect(res.status).toBe(200);
      }
    });

    it('rejects a wrong key of the same length', async () => {
      const res = await POST(makeRequest({ Authorization: `Bearer ${'x'.repeat(SECRET.length)}` }));
      expect(res.status).toBe(401);
    });

    it('rejects a key of a different length without throwing', async () => {
      const res = await POST(makeRequest({ Authorization: 'Bearer short' }));
      expect(res.status).toBe(401);
    });

    it('compares the key case-sensitively', async () => {
      const res = await POST(makeRequest({ Authorization: `Bearer ${SECRET.toUpperCase()}` }));
      expect(res.status).toBe(401);
    });

    it('does not alter the key: extra whitespace fails', () => {
      // Headers already trims leading/trailing whitespace, so use interior whitespace.
      expect(verifyMightyNetworksRequest(new Headers({ authorization: `Bearer  ${SECRET}` }))).toBe(false);
    });

    it('rejects a missing Authorization header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects the bare key without a scheme', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(401);
    });

    it('rejects a different scheme', async () => {
      const res = await POST(makeRequest({ Authorization: `Basic ${SECRET}` }));
      expect(res.status).toBe(401);
    });

    it('rejects a key with non-ASCII characters without throwing', () => {
      const headers = new Headers({ authorization: 'Bearer clé-secrète' });
      expect(verifyMightyNetworksRequest(headers)).toBe(false);
    });

    it('rejects everything when no secret is configured', () => {
      const headers = new Headers({ authorization: BEARER });
      expect(verifyMightyNetworksRequest(headers, '')).toBe(false);
      expect(verifyMightyNetworksRequest(headers, undefined)).toBe(true); // falls back to the env var
      delete process.env.MIGHTY_NETWORKS_WEBHOOK_SECRET;
      expect(verifyMightyNetworksRequest(headers)).toBe(false);
      process.env.MIGHTY_NETWORKS_WEBHOOK_SECRET = SECRET;
    });

    it('strips a leading "Bearer " from the configured secret', () => {
      const headers = new Headers({ authorization: BEARER });
      expect(verifyMightyNetworksRequest(headers, `Bearer ${SECRET}`)).toBe(true);
      expect(verifyMightyNetworksRequest(headers, `bearer ${SECRET}`)).toBe(true);
    });

    it('rejects an empty bearer key', () => {
      expect(verifyMightyNetworksRequest(new Headers({ authorization: 'Bearer ' }), 'Bearer ')).toBe(false);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await POST(makeRequest({ Authorization: BEARER }, JSON.stringify(samplePayload()), 'text/plain'));
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ Authorization: BEARER }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a JSON array', async () => {
      const res = await POST(makeRequest({ Authorization: BEARER }, '[]'));
      expect(res.status).toBe(400);
    });

    it('returns 401 (not 400) for invalid JSON without a key', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('Events', () => {
    it.each(EVENTS)('handles %s sent as %sHook', async (name) => {
      const res = await POST(makeRequest({ Authorization: BEARER }, JSON.stringify(samplePayload(`${name}Hook`))));
      expect(res.status).toBe(200);
    });

    it('handles an event without the Hook suffix', async () => {
      const res = await POST(makeRequest({ Authorization: BEARER }, JSON.stringify(samplePayload('MemberJoined'))));
      expect(res.status).toBe(200);
    });

    it('accepts events it has no handler for', async () => {
      const res = await POST(
        makeRequest({ Authorization: BEARER }, JSON.stringify(samplePayload('GiftLeaderboardUpdatedHook')))
      );
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
      const first = await POST(makeRequest({ Authorization: BEARER }, body));
      const second = await POST(makeRequest({ Authorization: BEARER }, body));
      expect(await first.json()).toEqual({ received: true });
      expect(second.status).toBe(200);
      expect(await second.json()).toEqual({ received: true, duplicate: true });
    });
  });
});
