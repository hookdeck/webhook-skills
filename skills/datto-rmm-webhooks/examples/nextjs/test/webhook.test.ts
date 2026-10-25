import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/datto-rmm/route';
import { verifyDattoRmmRequest } from '../lib/verify-datto-rmm';

const HEADER = 'X-Datto-Secret';
const SECRET = 'Bearer test_datto_rmm_secret_0123456789';

beforeAll(() => {
  process.env.DATTO_RMM_WEBHOOK_HEADER = HEADER;
  process.env.DATTO_RMM_WEBHOOK_SECRET = SECRET;
});

// ILLUSTRATIVE payload: Datto RMM adds no event field; "status" comes from the user's template.
function samplePayload(status = 'raised') {
  return {
    status,
    alert_uid: 'a1b2c3d4',
    alert_type: 'disk usage',
    alert_category: 'performance',
    alert_message: 'C: drive is at 95% capacity',
    device_hostname: 'SRV-01',
    site_name: 'Acme',
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/datto-rmm', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/datto-rmm', () => {
  describe('secret header verification', () => {
    it('accepts the correct header value', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ [HEADER.toLowerCase()]: SECRET }));
      expect(res.status).toBe(200);
    });

    it('compares the whole value, Bearer prefix included', async () => {
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

    it('defaults to the Authorization header when no name is configured', () => {
      delete process.env.DATTO_RMM_WEBHOOK_HEADER;
      expect(verifyDattoRmmRequest(new Headers({ authorization: SECRET }))).toBe(true);
      expect(verifyDattoRmmRequest(new Headers({ [HEADER]: SECRET }))).toBe(false);
      process.env.DATTO_RMM_WEBHOOK_HEADER = HEADER;
    });

    it('rejects everything when the secret is unset', () => {
      const headers = new Headers({ [HEADER]: SECRET });
      expect(verifyDattoRmmRequest(headers, { secret: '' })).toBe(false);
      delete process.env.DATTO_RMM_WEBHOOK_SECRET;
      expect(verifyDattoRmmRequest(headers)).toBe(false);
      process.env.DATTO_RMM_WEBHOOK_SECRET = SECRET;
    });
  });

  describe('body handling', () => {
    it('accepts text/plain bodies', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, 'Alert raised on SRV-01', 'text/plain'));
      expect(res.status).toBe(200);
    });

    it('accepts form-urlencoded bodies', async () => {
      const res = await POST(
        makeRequest({ [HEADER]: SECRET }, 'status=resolved&alert_uid=a1b2c3d4', 'application/x-www-form-urlencoded')
      );
      expect(res.status).toBe(200);
    });

    it('accepts invalid JSON (treated as text) after authenticating', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '{not json'));
      expect(res.status).toBe(200);
    });

    it('returns 401 before looking at the body', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('alert handling (illustrative template)', () => {
    it.each(['raised', 'resolved'])('handles %s', async (status) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload(status))));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges payloads without a recognised status', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify({ hello: 'world' })));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(true);
      spy.mockRestore();
    });
  });
});
