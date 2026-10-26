import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/omnisend/route';
import { verifyOmnisendRequest } from '../lib/verify-omnisend';

const SECRET = 'test_omnisend_secret_0123456789';

beforeAll(() => {
  process.env.OMNISEND_WEBHOOK_HEADER = 'X-Webhook-Secret';
  process.env.OMNISEND_WEBHOOK_SECRET = SECRET;
});

function samplePayload(event = 'subscribed') {
  return { contactEmail: 'jane@example.com', contactName: 'Jane', event };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/omnisend', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/omnisend', () => {
  describe('shared secret header verification', () => {
    it('accepts the correct secret', async () => {
      const res = await POST(makeRequest({ 'X-Webhook-Secret': SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ 'x-webhook-secret': SECRET }));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong secret of the same length', async () => {
      const res = await POST(makeRequest({ 'X-Webhook-Secret': 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a secret of a different length without throwing', async () => {
      const res = await POST(makeRequest({ 'X-Webhook-Secret': 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('compares the whole value and does not strip a Bearer prefix', async () => {
      const res = await POST(makeRequest({ 'X-Webhook-Secret': `Bearer ${SECRET}` }));
      expect(res.status).toBe(401);
    });
  });

  describe('verifyOmnisendRequest', () => {
    it('accepts an exact Bearer-style value', () => {
      const headers = new Headers({ authorization: 'Bearer abc123' });
      expect(verifyOmnisendRequest(headers, { headerName: 'Authorization', secret: 'Bearer abc123' })).toBe(true);
      expect(verifyOmnisendRequest(new Headers({ authorization: 'abc123' }), { headerName: 'Authorization', secret: 'Bearer abc123' })).toBe(false);
    });

    it('reads a custom header name', () => {
      const opts = { headerName: 'X-Omnisend-Key', secret: 's3cret' };
      expect(verifyOmnisendRequest(new Headers({ 'x-omnisend-key': 's3cret' }), opts)).toBe(true);
      expect(verifyOmnisendRequest(new Headers({ 'x-webhook-secret': 's3cret' }), opts)).toBe(false);
    });

    it('fails closed when the secret is unset', () => {
      expect(verifyOmnisendRequest(new Headers({ 'x-webhook-secret': 'x' }), { secret: '' })).toBe(false);
    });
  });

  describe('request handling', () => {
    it.each(['subscribed', 'placed order', 'something custom'])('handles event %s', async (event) => {
      const res = await POST(makeRequest({ 'X-Webhook-Secret': SECRET }, JSON.stringify(samplePayload(event))));
      expect(res.status).toBe(200);
    });

    it('accepts any content type', async () => {
      const res = await POST(makeRequest({ 'X-Webhook-Secret': SECRET }, JSON.stringify(samplePayload()), 'text/plain'));
      expect(res.status).toBe(200);
    });

    it('checks the secret before parsing the body', async () => {
      const res = await POST(makeRequest({ 'X-Webhook-Secret': 'wrong' }, 'not json'));
      expect(res.status).toBe(401);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await POST(makeRequest({ 'X-Webhook-Secret': SECRET }, 'not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object body', async () => {
      const res = await POST(makeRequest({ 'X-Webhook-Secret': SECRET }, '[1,2]'));
      expect(res.status).toBe(400);
    });
  });
});
