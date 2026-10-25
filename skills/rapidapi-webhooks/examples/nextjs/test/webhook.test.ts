import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/rapidapi/route';
import { verifyRapidApiRequest } from '../lib/verify-rapidapi';

const SECRET = 'test_rapidapi_secret_0123456789';
const HEADER = 'x-rapidapi-webhook-secret';

const EVENTS = [
  'API Created', 'API Updated', 'API Deleted', 'Subscription Created',
  'Subscription Updated', 'User Created', 'Billing Plan Updated',
];

beforeAll(() => {
  process.env.RAPIDAPI_WEBHOOK_SECRET = SECRET;
  process.env.RAPIDAPI_EVENT_FIELD = 'eventType'; // illustrative field name
});

// Illustrative payload: RapidAPI does not document the body format.
function samplePayload(event = 'API Created') {
  return { eventType: event, data: { id: 'example-id' } };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/rapidapi', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/rapidapi', () => {
  describe('x-rapidapi-webhook-secret verification', () => {
    it('accepts the correct secret', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ 'X-RapidAPI-Webhook-Secret': SECRET }));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong secret of the same length', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a secret of a different length without throwing', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a prefix of the secret (whole value compared)', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET.slice(0, -1) }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing secret', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects everything when RAPIDAPI_WEBHOOK_SECRET is unset', () => {
      const headers = new Headers({ [HEADER]: SECRET });
      expect(verifyRapidApiRequest(headers, '')).toBe(false);
      expect(verifyRapidApiRequest(headers, undefined)).toBe(true);
      delete process.env.RAPIDAPI_WEBHOOK_SECRET;
      expect(verifyRapidApiRequest(headers)).toBe(false);
      process.env.RAPIDAPI_WEBHOOK_SECRET = SECRET;
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await POST(
        makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload()), 'text/plain')
      );
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without a secret', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (event) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload(event))));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges events it does not handle', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload('Team Updated')))
      );
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });
});
