import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/axiom/route';
import { verifyAxiomRequest } from '../lib/verify-axiom';

const NAME = 'X-Axiom-Token';
const SECRET = 'Bearer test_axiom_secret_0123456789';

beforeAll(() => {
  process.env.AXIOM_WEBHOOK_HEADER = NAME;
  process.env.AXIOM_WEBHOOK_SECRET = SECRET;
});

// Illustrative payload rendered from Axiom's default Custom webhook template.
function samplePayload(action = 'Open') {
  return {
    action,
    event: {
      monitorID: 'CabI3w142069etTgd0',
      body: 'Current value of 57347 is above or equal to the threshold value of 0',
      description: '',
      queryEndTime: '2024-06-28 14:55:57.631364493 +0000 UTC',
      queryStartTime: '2024-06-28 14:45:57.631364493 +0000 UTC',
      timestamp: '2024-06-28 14:55:57 +0000 UTC',
      title: 'Axiom Monitor Test',
      value: 57347,
      matchedEvent: null,
      groupKeys: null,
      groupValues: null,
    },
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload())
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/axiom', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('POST /webhooks/axiom', () => {
  describe('secret header verification', () => {
    it('accepts the correct header value', async () => {
      const res = await POST(makeRequest({ [NAME]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('looks the header up case-insensitively', async () => {
      const res = await POST(makeRequest({ [NAME.toLowerCase()]: SECRET }));
      expect(res.status).toBe(200);
    });

    it('compares the whole value, including the Bearer prefix', async () => {
      const res = await POST(makeRequest({ [NAME]: SECRET.replace(/^Bearer /, '') }));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await POST(makeRequest({ [NAME]: 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await POST(makeRequest({ [NAME]: 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('ignores the secret sent under a different header name', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(401);
    });

    it('rejects everything when no secret is configured', () => {
      const headers = new Headers({ [NAME]: SECRET });
      expect(verifyAxiomRequest(headers, { name: NAME, secret: '' })).toBe(false);
      expect(verifyAxiomRequest(headers, { name: NAME, secret: SECRET })).toBe(true);
    });

    it('defaults the header name to Authorization', () => {
      const saved = process.env.AXIOM_WEBHOOK_HEADER;
      delete process.env.AXIOM_WEBHOOK_HEADER;
      expect(verifyAxiomRequest(new Headers({ authorization: SECRET }))).toBe(true);
      process.env.AXIOM_WEBHOOK_HEADER = saved;
    });
  });

  describe('Body handling', () => {
    it('accepts any content type', async () => {
      const req = new NextRequest('http://localhost:3000/webhooks/axiom', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', [NAME]: SECRET },
        body: JSON.stringify(samplePayload()),
      });
      expect((await POST(req)).status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ [NAME]: SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest({ [NAME]: SECRET }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('Notification handling', () => {
    it.each(['Open', 'Closed'])('handles action %s', async (action) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [NAME]: SECRET }, JSON.stringify(samplePayload(action))));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown actions', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [NAME]: SECRET }, JSON.stringify(samplePayload('Paused'))));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });
});
