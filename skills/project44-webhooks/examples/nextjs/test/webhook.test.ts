import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, PUT, PATCH, GET } from '../app/webhooks/project44/route';
import { verifyProject44Request } from '../lib/verify-project44';

const SECRET = 'test_project44_secret_0123456789';

const EVENTS = [
  'shipments.v1.shipment.created', 'shipments.v1.shipment.deleted',
  'shipments.v1.event.added', 'shipments.v1.event.updated', 'shipments.v1.event.removed',
  'shipments.v1.state.added', 'shipments.v1.state.updated', 'shipments.v1.state.removed',
  'shipments.v1.exception.addedOrUpdated',
];

beforeAll(() => {
  process.env.PROJECT44_WEBHOOK_SECRET = SECRET;
  delete process.env.PROJECT44_WEBHOOK_HEADER; // default: X-Api-Key
});

function samplePayload(eventType = 'shipments.v1.event.added') {
  return {
    eventId: '333d2a1b-d332-4775-8f8e-960e5f538431',
    eventType,
    createdDateTime: '2025-03-31T17:01:42.92601441Z',
    dataType: 'EventChange',
    context: { shipment: { shipmentId: 'ac694c91-e308-4329-9584-ee10acb937b3' } },
    data: {},
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string | null = JSON.stringify(samplePayload()),
  method = 'POST',
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/project44', {
    method,
    headers: { 'content-type': contentType, ...headers },
    ...(body === null ? {} : { body }),
  });
}

describe('/webhooks/project44', () => {
  describe('API key header verification', () => {
    it('accepts the correct value', async () => {
      const res = await POST(makeRequest({ 'X-Api-Key': SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ 'x-api-key': SECRET }));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await POST(makeRequest({ 'X-Api-Key': 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await POST(makeRequest({ 'X-Api-Key': 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('compares the whole value and does not parse a Bearer prefix', async () => {
      const res = await POST(makeRequest({ 'X-Api-Key': `Bearer ${SECRET}` }));
      expect(res.status).toBe(401);
    });

    it('requires the Bearer prefix when the secret includes it', () => {
      const env = { PROJECT44_WEBHOOK_SECRET: 'Bearer abc123' };
      expect(verifyProject44Request(new Headers({ 'X-Api-Key': 'Bearer abc123' }), env)).toBe(true);
      expect(verifyProject44Request(new Headers({ 'X-Api-Key': 'abc123' }), env)).toBe(false);
    });

    it('reads a custom header name from PROJECT44_WEBHOOK_HEADER', () => {
      const env = { PROJECT44_WEBHOOK_SECRET: SECRET, PROJECT44_WEBHOOK_HEADER: 'X-Project44-Key' };
      expect(verifyProject44Request(new Headers({ 'x-project44-key': SECRET }), env)).toBe(true);
      expect(verifyProject44Request(new Headers({ 'x-api-key': SECRET }), env)).toBe(false);
    });

    it('rejects everything when PROJECT44_WEBHOOK_SECRET is unset', () => {
      expect(verifyProject44Request(new Headers({ 'x-api-key': SECRET }), {})).toBe(false);
      expect(
        verifyProject44Request(new Headers({ 'x-api-key': '' }), { PROJECT44_WEBHOOK_SECRET: '' })
      ).toBe(false);
    });
  });

  describe('HTTP methods and body handling', () => {
    it.each([
      ['POST', POST],
      ['PUT', PUT],
      ['PATCH', PATCH],
    ])('accepts %s', async (method, handler) => {
      const res = await handler(makeRequest({ 'X-Api-Key': SECRET }, JSON.stringify(samplePayload()), method));
      expect(res.status).toBe(200);
    });

    it('accepts GET with no body', async () => {
      const res = await GET(makeRequest({ 'X-Api-Key': SECRET }, null, 'GET'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('rejects GET without the header', async () => {
      const res = await GET(makeRequest({}, null, 'GET'));
      expect(res.status).toBe(401);
    });

    it('accepts any content type', async () => {
      const res = await POST(
        makeRequest({ 'X-Api-Key': SECRET }, JSON.stringify(samplePayload()), 'POST', 'text/plain')
      );
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ 'X-Api-Key': SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest({ 'X-Api-Key': SECRET }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (eventType) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ 'X-Api-Key': SECRET }, JSON.stringify(samplePayload(eventType))));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ 'X-Api-Key': SECRET }, JSON.stringify(samplePayload('shipments.v1.something.new')))
      );
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(true);
      spy.mockRestore();
    });
  });
});
