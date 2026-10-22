import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/currents/route';
import { verifyCurrentsRequest } from '../lib/verify-currents';

const SECRET = 'Bearer test_currents_secret_0123456789';

const EVENTS = ['RUN_START', 'RUN_FINISH', 'RUN_TIMEOUT', 'RUN_CANCELED'];

beforeAll(() => {
  process.env.CURRENTS_WEBHOOK_HEADER = 'Authorization';
  process.env.CURRENTS_WEBHOOK_SECRET = SECRET;
});

function samplePayload(event = 'RUN_FINISH') {
  return {
    event,
    runUrl: 'https://app.currents.dev/run/950a13c3edf4f28b6e8ce301a404b4aa',
    buildId: 'demo-build-cdx3314',
    groupId: 'chromium',
    tags: ['smoke'],
    commit: { sha: '5a7edc9a156e417068060d67109021351fc7d9b8', branch: 'feature-A' },
    overall: 24, passes: 21, failures: 2, pending: 0, skipped: 1, retries: 3, flaky: 1,
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload())
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/currents', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('POST /webhooks/currents', () => {
  describe('secret header verification', () => {
    it('accepts the exact header value', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ authorization: SECRET }));
      expect(res.status).toBe(200);
    });

    it('does not strip a Bearer prefix (whole value only)', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET.replace('Bearer ', '') }));
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

    it('rejects a forged x-timestamp without the secret', async () => {
      const res = await POST(makeRequest({ 'x-timestamp': String(Date.now()) }));
      expect(res.status).toBe(401);
    });

    it('honours a custom header name', () => {
      const headers = new Headers({ 'x-currents-secret': 'abc' });
      expect(verifyCurrentsRequest(headers, 'abc', 'X-Currents-Secret')).toBe(true);
      expect(verifyCurrentsRequest(headers, 'abd', 'X-Currents-Secret')).toBe(false);
      expect(verifyCurrentsRequest(headers, 'abc', 'Authorization')).toBe(false);
    });

    it('rejects an invalid configured header name instead of throwing', () => {
      expect(verifyCurrentsRequest(new Headers(), 'abc', 'bad header')).toBe(false);
    });

    it('rejects everything when no secret is configured', () => {
      const headers = new Headers({ authorization: SECRET });
      expect(verifyCurrentsRequest(headers, '')).toBe(false);
      expect(verifyCurrentsRequest(headers, SECRET)).toBe(true);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type', async () => {
      const req = new NextRequest('http://localhost:3000/webhooks/currents', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', authorization: SECRET },
        body: JSON.stringify(samplePayload()),
      });
      expect((await POST(req)).status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }, '[1,2]'));
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
      const res = await POST(
        makeRequest({ Authorization: SECRET }, JSON.stringify(samplePayload(event)))
      );
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ Authorization: SECRET }, JSON.stringify(samplePayload('RUN_SOMETHING_NEW')))
      );
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });
});
