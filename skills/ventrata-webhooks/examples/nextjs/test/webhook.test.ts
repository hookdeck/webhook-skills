import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/ventrata/route';
import { normalizeEvent, verifyVentrataRequest } from '../lib/verify-ventrata';

const HEADER = 'X-Webhook-Secret';
const SECRET = 'whsec_123456abcdef';

const EVENTS = [
  'order_update', 'booking_update', 'availability_update', 'product_update',
  'order.updated', 'booking.updated', 'availability.updated', 'product.updated',
];

beforeAll(() => {
  process.env.VENTRATA_WEBHOOK_HEADER = HEADER;
  process.env.VENTRATA_WEBHOOK_SECRET = SECRET;
});

function samplePayload(event = 'booking.updated') {
  return {
    event,
    webhook: { id: 'webhook_booking_update', event, url: 'https://example.com/webhooks/ventrata' },
    supplier: { id: '3d6f0a3a-59d4-4b16-a0c5-11d2d8a4e6b7', name: 'City Sightseeing Group' },
    order: { orderId: 'ord_20260514_9f3c21', status: 'ON_HOLD' },
    booking: { uuid: '89fe0192-ddcd-430a-b285-e1396a4725d2', status: 'ON_HOLD' },
    product: { id: 'e7cc8bb4-8d1c-4848-8824-5dbedb718681', internalName: 'Walking Tour of Barcelona' },
    availability: { id: '94cdd032-3d32-416d-b0a4-abf8b7495b8b', available: true },
    diff: [{ op: 'add', path: 'path-example', was: 'was-example', value: 'value-example' }],
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload())
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/ventrata', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('POST /webhooks/ventrata', () => {
  describe('secret header verification', () => {
    it('accepts the correct secret', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ 'x-webhook-secret': SECRET }));
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

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects the secret sent under a different header name', async () => {
      const res = await POST(makeRequest({ 'X-Other-Header': SECRET }));
      expect(res.status).toBe(401);
    });

    it('rejects everything when no secret is configured', () => {
      const headers = new Headers({ [HEADER]: SECRET });
      expect(verifyVentrataRequest(headers, '')).toBe(false);
      expect(verifyVentrataRequest(headers, SECRET)).toBe(true);
    });

    it('reads a custom header name', () => {
      expect(verifyVentrataRequest(new Headers({ 'x-ventrata-key': 'abc' }), 'abc', 'X-Ventrata-Key')).toBe(true);
      expect(verifyVentrataRequest(new Headers({ [HEADER]: 'abc' }), 'abc', 'X-Ventrata-Key')).toBe(false);
    });

    it('compares the whole value, including a Bearer prefix', () => {
      const secret = 'Bearer abc123';
      const h = (v: string) => new Headers({ authorization: v });
      expect(verifyVentrataRequest(h('Bearer abc123'), secret, 'Authorization')).toBe(true);
      expect(verifyVentrataRequest(h('abc123'), secret, 'Authorization')).toBe(false);
      expect(verifyVentrataRequest(h('Bearer abc123'), 'abc123', 'Authorization')).toBe(false);
    });
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const req = new NextRequest('http://localhost:3000/webhooks/ventrata', {
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

  describe('event handling', () => {
    it.each(EVENTS)('handles %s', async (event) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload(event))));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('normalizes both spellings to the same event', () => {
      expect(normalizeEvent('booking.updated')).toBe('booking_update');
      expect(normalizeEvent('booking_update')).toBe('booking_update');
      expect(normalizeEvent('something_new')).toBe('something_new');
    });

    it('acknowledges unknown events', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload('something_new'))));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });
});
