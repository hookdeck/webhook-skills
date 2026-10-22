import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/northflank/route';
import { verifyNorthflankRequest } from '../lib/verify-northflank';

const SECRET = 'test_northflank_secret_0123456789';
const HEADER = 'X-Northflank-Notification-Integration-Token';

beforeAll(() => {
  process.env.NORTHFLANK_WEBHOOK_SECRET = SECRET;
});

// Shape from Northflank's docs for a build:start notification
function samplePayload(event = 'build:start') {
  return {
    event,
    data: {
      build: {
        id: 'social-hour-1312',
        branch: 'master',
        pullRequestId: null,
        status: 'STARTING',
        sha: 'ca624abed0d5ba0ad6e6fe28c396196b81f0200d',
        concluded: false,
        createdAt: '2022-01-19T09:04:40.916Z',
      },
      service: { id: 'website', name: 'Website' },
      project: { id: 'personal-blog', name: 'Personal Blog' },
      user: { id: 'thomas' },
    },
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/northflank', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/northflank', () => {
  describe('Token verification', () => {
    it('accepts the correct token', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ 'x-northflank-notification-integration-token': SECRET }));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong token of the same length', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a token of a different length without throwing', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'short' }));
      expect(res.status).toBe(401);
    });

    it('returns 401 when the token header is missing', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });
  });

  describe('Request handling', () => {
    it('verifies any content type', async () => {
      const res = await POST(
        makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload()), 'text/plain')
      );
      expect(res.status).toBe(200);
    });

    it('returns 400 for an invalid JSON body', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '[1,2,3]'));
      expect(res.status).toBe(400);
    });

    it('handles every example event and unknown events', async () => {
      const events = [
        'build:start',
        'build:success',
        'build:failure',
        'service:deployment:status-update',
        'job-run:failure',
        'addon-backup:success',
        'addon-backup:failure',
        'billing:invoice-payment-failed',
        'something:else',
      ];
      for (const event of events) {
        const res = await POST(
          makeRequest({ [HEADER]: SECRET }, JSON.stringify({ event, data: {} }))
        );
        expect(res.status).toBe(200);
      }
    });
  });

  describe('verifyNorthflankRequest', () => {
    it('rejects everything when no secret is configured', () => {
      const headers = new Headers({ [HEADER]: '' });
      expect(verifyNorthflankRequest(headers, {})).toBe(false);
      expect(verifyNorthflankRequest(new Headers(), {})).toBe(false);
    });
  });
});
