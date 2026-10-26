import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/trendyol/route';
import { verifyTrendyolRequest } from '../lib/verify-trendyol';

const SECRET = 'test_trendyol_api_key_0123456789';

const STATUSES = [
  'CREATED', 'PICKING', 'INVOICED', 'SHIPPED', 'CANCELLED', 'DELIVERED', 'UNDELIVERED',
  'RETURNED', 'UNSUPPLIED', 'AWAITING', 'UNPACKED', 'AT_COLLECTION_POINT', 'VERIFIED',
];

beforeAll(() => {
  process.env.TRENDYOL_WEBHOOK_SECRET = SECRET;
});

let logSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

function samplePackage(status = 'Created') {
  return {
    orderNumber: '10654411111',
    shipmentPackageId: 3330111111,
    status,
    shipmentPackageStatus: status,
    cargoProviderName: 'Trendyol Express',
    lines: [{ lineId: 4765111111, quantity: 1, orderLineItemStatusName: status }],
  };
}

function samplePayload(status?: string) {
  return { totalElements: 1, totalPages: 1, page: 0, size: 1, content: [samplePackage(status)] };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload())
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/trendyol', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('Trendyol webhook route', () => {
  describe('x-api-key verification', () => {
    it('accepts the correct key', async () => {
      const res = await POST(makeRequest({ 'x-api-key': SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ 'X-API-KEY': SECRET }));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong key of the same length', async () => {
      const res = await POST(makeRequest({ 'x-api-key': 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a key of a different length without throwing', async () => {
      const res = await POST(makeRequest({ 'x-api-key': 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a key that only starts with the secret', async () => {
      const res = await POST(makeRequest({ 'x-api-key': `${SECRET}-extra` }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing key', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects an empty key', async () => {
      const res = await POST(makeRequest({ 'x-api-key': '' }));
      expect(res.status).toBe(401);
    });

    it('does not accept the key as an Authorization header', async () => {
      const res = await POST(makeRequest({ authorization: SECRET }));
      expect(res.status).toBe(401);
    });

    it('rejects everything when no secret is configured', () => {
      const headers = new Headers({ 'x-api-key': SECRET });
      expect(verifyTrendyolRequest(headers, '')).toBe(false);
      expect(verifyTrendyolRequest(headers, null as unknown as string)).toBe(false);
    });
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const res = await POST(
        makeRequest({ 'x-api-key': SECRET, 'content-type': 'text/plain' })
      );
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await POST(makeRequest({ 'x-api-key': SECRET }, 'not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 when content is not an array', async () => {
      const res = await POST(makeRequest({ 'x-api-key': SECRET }, JSON.stringify({ content: {} })));
      expect(res.status).toBe(400);
    });

    it('checks the key before parsing the body', async () => {
      const res = await POST(makeRequest({}, 'not json'));
      expect(res.status).toBe(401);
    });

    it('accepts an empty content page', async () => {
      const res = await POST(makeRequest({ 'x-api-key': SECRET }, JSON.stringify({ content: [] })));
      expect(res.status).toBe(200);
    });
  });

  describe('status dispatch', () => {
    it.each(STATUSES)('handles %s', async (status) => {
      const res = await POST(
        makeRequest({ 'x-api-key': SECRET }, JSON.stringify(samplePayload(status)))
      );
      expect(res.status).toBe(200);
      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled'));
    });

    it('compares the status case-insensitively', async () => {
      const res = await POST(
        makeRequest({ 'x-api-key': SECRET }, JSON.stringify(samplePayload('Delivered')))
      );
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Package delivered'));
    });

    it('handles every package in content[]', async () => {
      const body = { content: [samplePackage('Created'), samplePackage('Shipped')] };
      const res = await POST(makeRequest({ 'x-api-key': SECRET }, JSON.stringify(body)));
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Package created'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Package shipped'));
    });

    it('logs unknown statuses and still returns 200', async () => {
      const res = await POST(
        makeRequest({ 'x-api-key': SECRET }, JSON.stringify(samplePayload('Mystery')))
      );
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Unhandled package status'));
    });
  });
});

describe('verifyTrendyolRequest', () => {
  it('verifies a key containing non-ASCII characters', () => {
    const key = encodeURIComponent('anahtar-şğü'); // header values must be Latin-1 safe
    expect(verifyTrendyolRequest(new Headers({ 'x-api-key': key }), key)).toBe(true);
    expect(verifyTrendyolRequest(new Headers({ 'x-api-key': 'other' }), key)).toBe(false);
  });
});
