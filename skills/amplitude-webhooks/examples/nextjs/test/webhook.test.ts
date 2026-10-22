import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/amplitude/route';
import { verifyAmplitudeRequest } from '../lib/verify-amplitude';

const HEADER = 'X-Amplitude-Secret';
const SECRET = 'Bearer test_amplitude_secret_0123456789';

beforeAll(() => {
  process.env.AMPLITUDE_WEBHOOK_HEADER = HEADER;
  process.env.AMPLITUDE_WEBHOOK_SECRET = SECRET;
});

const eventPayload = {
  event_type: 'Button Clicked',
  user_id: 'user-123',
  event_time: '2026-10-22 20:07:01.795',
  event_properties: { button: 'signup' },
  user_properties: { plan: 'growth' },
};

const userPayload = { user_id: 'user-123', user_properties: { email: 'a@example.com' } };

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(eventPayload),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/amplitude', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/amplitude', () => {
  describe('secret header verification', () => {
    it('accepts the exact header value', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ [HEADER.toLowerCase()]: SECRET }));
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

    it('rejects the secret sent under a different header', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(401);
    });
  });

  describe('verifyAmplitudeRequest', () => {
    it('defaults the header name to Authorization', () => {
      const headers = new Headers({ authorization: 'Bearer abc' });
      delete process.env.AMPLITUDE_WEBHOOK_HEADER;
      try {
        expect(verifyAmplitudeRequest(headers, 'Bearer abc')).toBe(true);
      } finally {
        process.env.AMPLITUDE_WEBHOOK_HEADER = HEADER;
      }
    });

    it('returns false when no secret is configured', () => {
      expect(verifyAmplitudeRequest(new Headers({ [HEADER]: SECRET }), '')).toBe(false);
    });
  });

  describe('payload handling', () => {
    it('handles a forwarded event', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
    });

    it('handles a user properties update', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(userPayload)));
      expect(res.status).toBe(200);
    });

    it('accepts a custom template payload', async () => {
      const res = await POST(
        makeRequest({ [HEADER]: SECRET }, JSON.stringify({ name: 'click event', external_id: 'u1' }))
      );
      expect(res.status).toBe(200);
    });

    it('accepts any content type', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(eventPayload), 'text/plain'));
      expect(res.status).toBe(200);
    });

    it('authenticates before parsing: bad JSON with no secret is 401', async () => {
      const res = await POST(makeRequest({}, 'not json'));
      expect(res.status).toBe(401);
    });

    it('returns 400 for invalid JSON with a valid secret', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, 'not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a JSON array', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '[]'));
      expect(res.status).toBe(400);
    });
  });
});
