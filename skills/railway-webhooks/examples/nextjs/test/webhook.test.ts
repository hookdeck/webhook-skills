import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/railway/route';
import { verifyRailwayRequest } from '../lib/verify-railway';

const HEADER = 'X-Webhook-Secret';
const SECRET = 'test_railway_secret_0123456789';

beforeAll(() => {
  process.env.RAILWAY_WEBHOOK_HEADER = HEADER;
  process.env.RAILWAY_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function samplePayload(type = 'Deployment.failed') {
  return {
    type,
    details: { id: '8107edff-4b8e-44fc-b43a-04566e847a2a', source: 'GitHub', branch: 'main' },
    resource: {
      workspace: { id: 'w1', name: 'acme' },
      project: { id: 'p1', name: 'api' },
      environment: { id: 'e1', name: 'production', isEphemeral: false },
      service: { id: 's1', name: 'web' },
      deployment: { id: 'd1' },
    },
    severity: 'WARNING',
    timestamp: '2025-11-21T23:48:42.311Z',
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload())
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/railway', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('POST /webhooks/railway', () => {
  describe('secret header verification', () => {
    it('accepts the correct header value', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('looks the header up case-insensitively', async () => {
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

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects the secret sent under a different header name', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(401);
    });

    it('compares the whole value and does not strip a Bearer prefix', () => {
      const bearer = 'Bearer abc123';
      const h = (v: string) => new Headers({ authorization: v });
      expect(verifyRailwayRequest(h(bearer), bearer, 'Authorization')).toBe(true);
      expect(verifyRailwayRequest(h('abc123'), bearer, 'Authorization')).toBe(false);
      expect(verifyRailwayRequest(h(bearer), 'abc123', 'Authorization')).toBe(false);
    });

    it('rejects everything when no secret is configured', () => {
      const headers = new Headers({ [HEADER]: SECRET });
      expect(verifyRailwayRequest(headers, '', HEADER)).toBe(false);
      expect(verifyRailwayRequest(headers, SECRET, HEADER)).toBe(true);
    });
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const req = new NextRequest('http://localhost:3000/webhooks/railway', {
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

  describe('event handling', () => {
    it('handles Deployment.failed', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Deployment failed'))).toBe(true);
    });

    it('handles other Deployment.<state> types by prefix', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload('Deployment.success'))));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Deployment success'))).toBe(true);
    });

    it('acknowledges alert and unknown types', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload('Alert.triggered'))));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(true);
    });
  });
});
