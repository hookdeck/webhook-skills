import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/soniox/route';
import { verifySonioxRequest } from '../lib/verify-soniox';

const SECRET = 'Bearer test_soniox_secret_0123456789';

beforeAll(() => {
  process.env.SONIOX_WEBHOOK_HEADER = 'Authorization';
  process.env.SONIOX_WEBHOOK_SECRET = SECRET;
});

// Payload as shown in Soniox's docs
function samplePayload(status = 'completed') {
  return { id: '548d023b-2b3d-4dc2-a3ef-cca26d05fd9a', status };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/soniox', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/soniox', () => {
  describe('auth header verification', () => {
    it('accepts the correct whole header value', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ authorization: SECRET }));
      expect(res.status).toBe(200);
    });

    it('does not strip a Bearer prefix: the bare token is rejected', async () => {
      const res = await POST(makeRequest({ Authorization: 'test_soniox_secret_0123456789' }));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await POST(makeRequest({ Authorization: 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await POST(makeRequest({ Authorization: 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects when the secret is not configured', () => {
      const headers = new Headers({ Authorization: SECRET });
      expect(verifySonioxRequest(headers, { secret: '' })).toBe(false);
    });

    it('supports a custom header name', () => {
      const opts = { name: 'X-Soniox-Secret', secret: 'abc123' };
      expect(verifySonioxRequest(new Headers({ 'x-soniox-secret': 'abc123' }), opts)).toBe(true);
      expect(verifySonioxRequest(new Headers({ authorization: 'abc123' }), opts)).toBe(false);
    });
  });

  describe('statuses', () => {
    it.each(['completed', 'error'])('handles status %s', async (status) => {
      const res = await POST(
        makeRequest({ Authorization: SECRET }, JSON.stringify(samplePayload(status)))
      );
      expect(res.status).toBe(200);
    });

    it('accepts an unknown status', async () => {
      const res = await POST(
        makeRequest({ Authorization: SECRET }, JSON.stringify(samplePayload('queued')))
      );
      expect(res.status).toBe(200);
    });
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const res = await POST(
        makeRequest({ Authorization: SECRET }, JSON.stringify(samplePayload()), 'text/plain')
      );
      expect(res.status).toBe(200);
    });

    it('rejects invalid JSON after authentication', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }, 'not json'));
      expect(res.status).toBe(400);
    });

    it('rejects a non-object body', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for bad JSON without the header', async () => {
      const res = await POST(makeRequest({}, 'not json'));
      expect(res.status).toBe(401);
    });
  });
});
