import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/swan/route';
import { verifySwanRequest } from '../lib/verify-swan';

const SECRET = 'test_swan_secret_0123456789';

const EVENTS = [
  'Transaction.Booked', 'Transaction.Pending', 'Transaction.Rejected', 'Account.Created',
  'AccountHolder.Updated', 'Card.Created', 'Onboarding.Updated',
];

beforeAll(() => {
  process.env.SWAN_WEBHOOK_SECRET = SECRET;
});

let counter = 0;
function samplePayload(eventType = 'Transaction.Booked') {
  counter += 1;
  return {
    eventType,
    eventId: `evt_${counter}`,
    eventDate: '2021-08-18T09:35:46.673Z',
    projectId: 'project-id',
    resourceId: 'resource-id',
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/swan', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/swan', () => {
  describe('x-swan-secret verification', () => {
    it('accepts the correct secret', async () => {
      const res = await POST(makeRequest({ 'x-swan-secret': SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ 'X-Swan-Secret': SECRET }));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong secret of the same length', async () => {
      const res = await POST(makeRequest({ 'x-swan-secret': 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a secret of a different length without throwing', async () => {
      const res = await POST(makeRequest({ 'x-swan-secret': 'short' }));
      expect(res.status).toBe(401);
    });

    it('compares the whole value', async () => {
      expect((await POST(makeRequest({ 'x-swan-secret': SECRET.slice(0, -1) }))).status).toBe(401);
      expect((await POST(makeRequest({ 'x-swan-secret': `${SECRET}x` }))).status).toBe(401);
      expect((await POST(makeRequest({ 'x-swan-secret': `Bearer ${SECRET}` }))).status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects everything when SWAN_WEBHOOK_SECRET is unset', () => {
      const headers = new Headers({ 'x-swan-secret': SECRET });
      expect(verifySwanRequest(headers, '')).toBe(false);
      expect(verifySwanRequest(headers, SECRET)).toBe(true);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type', async () => {
      const res = await POST(
        makeRequest({ 'x-swan-secret': SECRET }, JSON.stringify(samplePayload()), 'text/plain')
      );
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ 'x-swan-secret': SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest({ 'x-swan-secret': SECRET }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the secret', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (eventType) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ 'x-swan-secret': SECRET }, JSON.stringify(samplePayload(eventType)))
      );
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ 'x-swan-secret': SECRET }, JSON.stringify(samplePayload('Something.New')))
      );
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    it('dedupes on eventId', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const body = JSON.stringify(samplePayload());
      const first = await POST(makeRequest({ 'x-swan-secret': SECRET }, body));
      const second = await POST(makeRequest({ 'x-swan-secret': SECRET }, body));
      expect(await first.json()).toEqual({ received: true });
      expect(second.status).toBe(200);
      expect(await second.json()).toEqual({ received: true, duplicate: true });
      expect(spy.mock.calls.filter(([m]) => String(m).startsWith('Transaction booked'))).toHaveLength(1);
      spy.mockRestore();
    });
  });
});
