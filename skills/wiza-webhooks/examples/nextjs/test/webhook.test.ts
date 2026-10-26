import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/wiza/route';
import { verifyWizaRequest } from '../lib/verify-wiza';

const API_KEY = 'test_wiza_api_key_0123456789';
// What Wiza sends: lowercase hex SHA-256 of the API key
const AUTH_KEY = crypto.createHash('sha256').update(API_KEY).digest('hex');

beforeAll(() => {
  process.env.WIZA_API_KEY = API_KEY;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function samplePayload(code = 200) {
  return {
    status: { code, message: code === 200 ? 'Single reveal finished' : 'Failed' },
    type: 'individual_reveal',
    data: { id: 12345, status: code === 200 ? 'finished' : 'failed', email: 'jane@example.com', name: 'Jane Doe' },
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/wiza', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/wiza', () => {
  describe('x-auth-key verification', () => {
    it('accepts the SHA-256 hex of the API key', async () => {
      const res = await POST(makeRequest({ 'x-auth-key': AUTH_KEY }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ 'X-Auth-Key': AUTH_KEY }));
      expect(res.status).toBe(200);
    });

    it('rejects the raw API key (must be the hash)', async () => {
      const res = await POST(makeRequest({ 'x-auth-key': API_KEY }));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong hash of the same length', async () => {
      const res = await POST(makeRequest({ 'x-auth-key': 'a'.repeat(AUTH_KEY.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await POST(makeRequest({ 'x-auth-key': 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects everything when WIZA_API_KEY is unset', () => {
      const headers = new Headers({ 'x-auth-key': AUTH_KEY });
      expect(verifyWizaRequest(headers, '')).toBe(false);
      delete process.env.WIZA_API_KEY;
      expect(verifyWizaRequest(headers)).toBe(false);
      process.env.WIZA_API_KEY = API_KEY;
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await POST(
        makeRequest({ 'x-auth-key': AUTH_KEY }, JSON.stringify(samplePayload()), 'text/plain')
      );
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ 'x-auth-key': AUTH_KEY }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest({ 'x-auth-key': AUTH_KEY }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it('handles a finished individual_reveal', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ 'x-auth-key': AUTH_KEY }));
      expect(res.status).toBe(200);
      expect(spy).toHaveBeenCalledWith('Reveal 12345 finished');
    });

    it('handles a failed individual_reveal', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ 'x-auth-key': AUTH_KEY }, JSON.stringify(samplePayload(400)))
      );
      expect(res.status).toBe(200);
      expect(spy).toHaveBeenCalledWith('Reveal 12345 failed');
    });

    it('acknowledges unknown types', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ 'x-auth-key': AUTH_KEY }, JSON.stringify({ type: 'something_new', data: { id: 1 } }))
      );
      expect(res.status).toBe(200);
      expect(spy).toHaveBeenCalledWith('Unhandled event type: something_new');
    });
  });
});
