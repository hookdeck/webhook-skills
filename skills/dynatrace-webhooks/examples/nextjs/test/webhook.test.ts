import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/dynatrace/route';
import { verifyDynatraceRequest } from '../lib/verify-dynatrace';

const HEADER = 'X-Webhook-Secret';
const SECRET = 'Bearer test_dynatrace_secret_0123456789';

beforeAll(() => {
  process.env.DYNATRACE_WEBHOOK_HEADER = HEADER;
  process.env.DYNATRACE_WEBHOOK_SECRET = SECRET;
});

// Illustrative payload: Dynatrace sends whatever template you configure.
function samplePayload(state = 'OPEN') {
  return {
    ProblemID: 'P-2401',
    State: state,
    ProblemTitle: 'Response time degradation',
    ImpactedEntity: 'checkout-service',
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/dynatrace', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/dynatrace', () => {
  describe('secret header verification', () => {
    it('accepts the exact whole header value', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ [HEADER.toLowerCase()]: SECRET }));
      expect(res.status).toBe(200);
    });

    it('compares the whole value, not a stripped Bearer token', async () => {
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

    it('ignores the secret under a different header name', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(401);
    });

    it('rejects everything when no secret is configured', () => {
      const headers = new Headers({ [HEADER]: SECRET });
      expect(verifyDynatraceRequest(headers, HEADER, '')).toBe(false);
      expect(verifyDynatraceRequest(headers, HEADER, SECRET)).toBe(true);
    });
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload()), 'text/plain'));
      expect(res.status).toBe(200);
    });

    it('accepts XML bodies', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '<problem><id>1</id></problem>', 'application/xml'));
      expect(res.status).toBe(200);
    });

    it('accepts plain text bodies', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, 'Problem P-1 OPEN', 'text/plain'));
      expect(res.status).toBe(200);
    });

    it('returns 401 for an unauthenticated non-JSON body', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('problem handling', () => {
    it.each(['OPEN'])('handles %s', async (state) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload(state))));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    // The docs show only OPEN; other values (e.g. the one sent on resolution) are logged.
    it('acknowledges and logs other states', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload('NOT_OPEN'))));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).includes('state NOT_OPEN'))).toBe(true);
      spy.mockRestore();
    });
  });
});
