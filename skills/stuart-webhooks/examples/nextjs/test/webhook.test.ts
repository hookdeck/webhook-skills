import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/stuart/route';
import { verifyStuartRequest } from '../lib/verify-stuart';

const HEADER = 'X-Webhook-Secret';
const SECRET = 'Bearer test_stuart_key_0123456789';

const TOPICS = [
  'package_created', 'courier_assigned', 'courier_arriving', 'package_split', 'courier_waiting',
  'package_delivering', 'package_delivered', 'package_canceled', 'package_returning',
  'package_returned', 'courier_reassigning', 'courier_moving',
];

beforeAll(() => {
  process.env.STUART_WEBHOOK_HEADER = HEADER;
  process.env.STUART_WEBHOOK_SECRET = SECRET;
});

function samplePayload(topic = 'package_created') {
  return {
    version: 'v3',
    occurred_at: '2023-02-13T15:29:36.000+01:00',
    event_id: '93ce4c52-5b27-4cec-9baf-68cfcdd4da46',
    webhook_id: 2359,
    topic,
    details: {
      account: { id: 451871 },
      package: { id: '10000000001', reference: '1676298576' },
    },
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload())
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/stuart', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('POST /webhooks/stuart', () => {
  describe('authentication header verification', () => {
    it('accepts the correct value', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ [HEADER.toLowerCase()]: SECRET }));
      expect(res.status).toBe(200);
    });

    it('compares the whole value, including the Bearer prefix', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET.replace('Bearer ', '') }));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('ignores the secret sent under a different header', async () => {
      const res = await POST(makeRequest({ 'X-Other': SECRET }));
      expect(res.status).toBe(401);
    });

    it('rejects everything when no secret is configured', () => {
      const headers = new Headers({ [HEADER]: SECRET });
      expect(verifyStuartRequest(headers, HEADER, '')).toBe(false);
      expect(verifyStuartRequest(headers, HEADER, SECRET)).toBe(true);
    });

    it('uses a custom header name', () => {
      const headers = new Headers({ 'X-Stuart-Auth': 'k' });
      expect(verifyStuartRequest(headers, 'X-Stuart-Auth', 'k')).toBe(true);
      expect(verifyStuartRequest(headers, 'X-Webhook-Secret', 'k')).toBe(false);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type', async () => {
      const req = new NextRequest('http://localhost:3000/webhooks/stuart', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', [HEADER]: SECRET },
        body: JSON.stringify(samplePayload()),
      });
      expect((await POST(req)).status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(TOPICS)('handles %s', async (topic) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload(topic))));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown topics', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload('something_new')))
      );
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    it('tolerates a payload without details', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify({ topic: 'package_created' })));
      expect(res.status).toBe(200);
    });
  });
});
