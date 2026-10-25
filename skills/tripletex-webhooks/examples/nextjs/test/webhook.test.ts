import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/tripletex/route';
import { verifyTripletexRequest } from '../lib/verify-tripletex';

const HEADER = 'X-Tripletex-Auth';
const SECRET = 'Bearer test_tripletex_secret_0123456789';

const OBJECTS = [
  'supplier', 'employee', 'order', 'product', 'account', 'project',
  'customer', 'contact', 'archiverelation', 'voucher',
];
const EVENTS = [
  'invoice.charged',
  ...OBJECTS.flatMap((o) => ['create', 'update', 'delete'].map((v) => `${o}.${v}`)),
  'notification.sent',
  'voucherstatus.ready',
  'closegroup.create',
  'closegroup.delete',
];

beforeAll(() => {
  process.env.TRIPLETEX_WEBHOOK_HEADER = HEADER;
  process.env.TRIPLETEX_WEBHOOK_SECRET = SECRET;
});

function samplePayload(event = 'product.create') {
  return {
    subscriptionId: 42,
    event,
    id: 1001,
    value: event.endsWith('.delete') ? null : { id: 1001, version: 3, name: 'Consulting hour' },
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload())
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/tripletex', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('POST /webhooks/tripletex', () => {
  describe('Authentication header', () => {
    it('accepts the correct header value', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ [HEADER.toLowerCase()]: SECRET }));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'short' }));
      expect(res.status).toBe(401);
    });

    it('compares the whole value: the secret without its Bearer prefix is rejected', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET.replace('Bearer ', '') }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('does not read a different header', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(401);
    });

    it('rejects everything when no secret is configured', () => {
      const headers = new Headers({ 'x-tripletex-auth': SECRET });
      expect(verifyTripletexRequest(headers, '', HEADER)).toBe(false);
      expect(verifyTripletexRequest(headers, SECRET, HEADER)).toBe(true);
    });

    it('defaults the header name to Authorization', () => {
      const saved = process.env.TRIPLETEX_WEBHOOK_HEADER;
      delete process.env.TRIPLETEX_WEBHOOK_HEADER;
      expect(verifyTripletexRequest(new Headers({ authorization: SECRET }))).toBe(true);
      expect(verifyTripletexRequest(new Headers({ 'x-tripletex-auth': SECRET }))).toBe(false);
      process.env.TRIPLETEX_WEBHOOK_HEADER = saved;
    });
  });

  describe('Body handling', () => {
    it('accepts any content type', async () => {
      const req = new NextRequest('http://localhost:3000/webhooks/tripletex', {
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
    it.each(EVENTS)('handles %s', async (event) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload(event))));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload('widget.explode')))
      );
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(true);
      spy.mockRestore();
    });
  });
});
