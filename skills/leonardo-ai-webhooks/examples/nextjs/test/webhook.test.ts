import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/leonardo-ai/route';
import { verifyLeonardoRequest } from '../lib/verify-leonardo-ai';

const SECRET = 'test_leonardo_callback_key_0123456789';
const BEARER = `Bearer ${SECRET}`;

beforeAll(() => {
  process.env.LEONARDO_AI_WEBHOOK_SECRET = SECRET;
});

// Based on the payload shown in Leonardo.Ai's webhook callback guide (trimmed).
function samplePayload(type = 'image_generation.complete') {
  return {
    type,
    object: 'generation',
    timestamp: 1699490546932,
    api_version: 'v1',
    data: {
      object: {
        id: 'XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX',
        status: 'COMPLETE',
        prompt: 'An oil painting of a cat',
        images: [
          {
            id: 'XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX',
            url: 'https://cdn.leonardo.ai/users/x/generations/y/Leonardo_Creative_An_oil_painting_of_a_cat_0.jpg',
            generationId: 'XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX',
          },
        ],
      },
    },
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload())
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/leonardo-ai', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('POST /webhooks/leonardo-ai', () => {
  describe('Authorization Bearer verification', () => {
    it('accepts the correct key', async () => {
      const res = await POST(makeRequest({ Authorization: BEARER }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the scheme case-insensitively', async () => {
      for (const scheme of ['bearer', 'BEARER', 'BeArEr']) {
        const res = await POST(makeRequest({ Authorization: `${scheme} ${SECRET}` }));
        expect(res.status).toBe(200);
      }
    });

    it('rejects a wrong key of the same length', async () => {
      const res = await POST(makeRequest({ Authorization: `Bearer ${'x'.repeat(SECRET.length)}` }));
      expect(res.status).toBe(401);
    });

    it('rejects a key of a different length without throwing', async () => {
      const res = await POST(makeRequest({ Authorization: 'Bearer short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects the bare key without the Bearer scheme', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(401);
    });

    it('rejects a different scheme', async () => {
      const res = await POST(makeRequest({ Authorization: `Basic ${SECRET}` }));
      expect(res.status).toBe(401);
    });

    it('does not trim the key', async () => {
      // Headers normalise outer whitespace, so check the helper directly.
      expect(verifyLeonardoRequest(new Headers({ authorization: BEARER }), `${SECRET} `)).toBe(false);
      expect(verifyLeonardoRequest(new Headers({ authorization: BEARER }), SECRET)).toBe(true);
    });

    it('rejects everything when no secret is configured', () => {
      const headers = new Headers({ authorization: BEARER });
      expect(verifyLeonardoRequest(headers, '')).toBe(false);
      expect(verifyLeonardoRequest(headers, SECRET)).toBe(true);
    });

    it('strips a "Bearer " prefix from the configured secret', () => {
      const headers = new Headers({ authorization: BEARER });
      expect(verifyLeonardoRequest(headers, `bearer ${SECRET}`)).toBe(true);
      expect(verifyLeonardoRequest(headers, 'Bearer ')).toBe(false);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type', async () => {
      const req = new NextRequest('http://localhost:3000/webhooks/leonardo-ai', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', authorization: BEARER },
        body: JSON.stringify(samplePayload()),
      });
      expect((await POST(req)).status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ Authorization: BEARER }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest({ Authorization: BEARER }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without a key', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it('handles image_generation.complete', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ Authorization: BEARER }));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).includes('COMPLETE: 1 image(s)'))).toBe(true);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ Authorization: BEARER }, JSON.stringify(samplePayload('something.new')))
      );
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(true);
      spy.mockRestore();
    });
  });
});
