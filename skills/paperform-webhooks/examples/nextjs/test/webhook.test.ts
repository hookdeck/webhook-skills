import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/paperform/route';
import { verifyPaperformRequest } from '../lib/verify-paperform';

const HEADER = 'X-Webhook-Secret';
const SECRET = 'Bearer test_paperform_secret_0123456789';

beforeAll(() => {
  process.env.PAPERFORM_WEBHOOK_HEADER = HEADER;
  process.env.PAPERFORM_WEBHOOK_SECRET = SECRET;
});

function samplePayload() {
  return {
    data: [
      { title: 'question 1', description: 'First', type: 'address', key: 'ba7ri', custom_key: 'address_1', value: '343 Tester Road' },
      { title: 'question 2', description: null, type: 'text', key: 'tgp8', custom_key: null, value: 'Test 123' },
    ],
    submission_id: 'XXXXXXXXXXXXXXXXXXX',
    created_at: '2017-06-09 09:51:23',
    ip_address: '192.168.10.1',
    charge: null,
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  path = '/webhooks/paperform',
  contentType = 'application/json'
): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/paperform', () => {
  describe('secret header verification', () => {
    it('accepts the correct header value', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ 'x-webhook-secret': SECRET }));
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

    it('rejects the secret sent under a different header name', async () => {
      const res = await POST(makeRequest({ 'X-Other': SECRET }));
      expect(res.status).toBe(401);
    });
  });

  describe('verifyPaperformRequest', () => {
    it('defaults the header name to Authorization', () => {
      const prev = process.env.PAPERFORM_WEBHOOK_HEADER;
      delete process.env.PAPERFORM_WEBHOOK_HEADER;
      try {
        const headers = new Headers({ authorization: 'Bearer abc' });
        expect(verifyPaperformRequest(headers, undefined, 'Bearer abc')).toBe(true);
      } finally {
        process.env.PAPERFORM_WEBHOOK_HEADER = prev;
      }
    });

    it('rejects everything when no secret is configured', () => {
      expect(verifyPaperformRequest(new Headers({ [HEADER]: 'anything' }), HEADER, '')).toBe(false);
    });
  });

  describe('payload handling', () => {
    it('accepts any content type', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload()), '/webhooks/paperform', 'text/plain'));
      expect(res.status).toBe(200);
    });

    it('handles a partial submission webhook (?trigger=partial)', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }, undefined, '/webhooks/paperform?trigger=partial'));
      expect(res.status).toBe(200);
      expect(spy.mock.calls[0][0]).toMatch(/^Partial submission/);
      spy.mockRestore();
    });

    it('treats a webhook without ?trigger as a new submission', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await POST(makeRequest({ [HEADER]: SECRET }));
      expect(spy.mock.calls[0][0]).toMatch(/^New submission/);
      spy.mockRestore();
    });

    it('accepts a payment submission with a charge', async () => {
      const body = JSON.stringify({ ...samplePayload(), charge: { total: '10.00', currency: 'USD' } });
      const res = await POST(makeRequest({ [HEADER]: SECRET }, body));
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 when data is not an array', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify({ data: 'x' })));
      expect(res.status).toBe(400);
    });

    it('does not parse the body before authenticating', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });
});
