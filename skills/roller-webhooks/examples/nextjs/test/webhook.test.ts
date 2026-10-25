import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/roller/route';
import { verifyRollerRequest } from '../lib/verify-roller';

const KEY = 'test_roller_api_key_0123456789abcdef';

const EVENTS = ['Booking.Created', 'Booking.Updated', 'Booking.Cancelled', 'Customer.Created', 'Redemption.Created', 'PaymentLink.Created'];

beforeAll(() => {
  process.env.ROLLER_WEBHOOK_API_KEY = KEY;
});

// ROLLER sends `type` and `eventType` as separate fields.
function eventBody(event: string): string {
  const [type, eventType] = event.split('.');
  return JSON.stringify({ type, eventType });
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = eventBody('Booking.Created'),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/roller', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/roller', () => {
  describe('x-roller-apikey verification', () => {
    it('accepts the correct key', async () => {
      const res = await POST(makeRequest({ 'x-roller-apikey': KEY }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ 'X-ROLLER-APIKEY': KEY }));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong key of the same length', async () => {
      const res = await POST(makeRequest({ 'x-roller-apikey': 'x'.repeat(KEY.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a key of a different length without throwing', async () => {
      const res = await POST(makeRequest({ 'x-roller-apikey': 'short' }));
      expect(res.status).toBe(401);
    });

    it('compares the whole value', async () => {
      expect((await POST(makeRequest({ 'x-roller-apikey': `${KEY}extra` }))).status).toBe(401);
      expect((await POST(makeRequest({ 'x-roller-apikey': KEY.slice(0, -1) }))).status).toBe(401);
    });

    it('rejects a missing key', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects everything when ROLLER_WEBHOOK_API_KEY is unset', () => {
      const headers = new Headers({ 'x-roller-apikey': KEY });
      expect(verifyRollerRequest(headers, '')).toBe(false);
      expect(verifyRollerRequest(headers, undefined)).toBe(true); // falls back to env
      expect(verifyRollerRequest(headers, KEY)).toBe(true);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type', async () => {
      const res = await POST(
        makeRequest({ 'x-roller-apikey': KEY }, eventBody('Booking.Created'), 'text/plain')
      );
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ 'x-roller-apikey': KEY }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest({ 'x-roller-apikey': KEY }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without a key', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (type) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ 'x-roller-apikey': KEY }, eventBody(type)));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ 'x-roller-apikey': KEY }, eventBody('Something.New')));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });
});
