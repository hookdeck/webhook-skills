import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/vtex/route';
import { verifyVtexRequest } from '../lib/verify-vtex';

const HEADER = 'X-Webhook-Secret';
const SECRET = 'test_vtex_secret_0123456789';

const STATES = [
  'order-created', 'on-order-completed', 'payment-pending', 'payment-approved',
  'waiting-ffmt-authorization', 'ready-for-handling', 'start-handling', 'handling',
  'invoiced', 'cancel', 'canceled',
];

beforeAll(() => {
  process.env.VTEX_WEBHOOK_HEADER = HEADER;
  process.env.VTEX_WEBHOOK_SECRET = SECRET;
});

function samplePayload(State = 'payment-approved') {
  return {
    Domain: 'Marketplace',
    OrderId: 'v40484048naf-01',
    State,
    LastChange: '2019-07-29T23:17:30.0617185Z',
    Origin: { Account: 'accountABC', Key: 'vtexappkey-keyEDF' },
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload())
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/vtex', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('POST /webhooks/vtex', () => {
  describe('secret header verification', () => {
    it('accepts the correct secret', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ 'x-webhook-secret': SECRET }));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong secret of the same length', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a secret of a different length without throwing', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('compares the whole value and does not parse a Bearer prefix', async () => {
      const res = await POST(makeRequest({ [HEADER]: `Bearer ${SECRET}` }));
      expect(res.status).toBe(401);
    });

    it('accepts a configured value that includes Bearer', () => {
      const ok = new Headers({ authorization: 'Bearer abc123' });
      expect(verifyVtexRequest(ok, 'Authorization', 'Bearer abc123')).toBe(true);
      const bare = new Headers({ authorization: 'abc123' });
      expect(verifyVtexRequest(bare, 'Authorization', 'Bearer abc123')).toBe(false);
    });

    it('reads the header name from configuration', () => {
      const headers = new Headers({ 'x-custom': SECRET });
      expect(verifyVtexRequest(headers, 'X-Custom', SECRET)).toBe(true);
      expect(verifyVtexRequest(headers, 'X-Webhook-Secret', SECRET)).toBe(false);
    });

    it('rejects everything when no secret is configured', () => {
      const headers = new Headers({ 'x-webhook-secret': SECRET });
      expect(verifyVtexRequest(headers, HEADER, '')).toBe(false);
      expect(verifyVtexRequest(headers, HEADER, SECRET)).toBe(true);
    });
  });

  describe('setup ping', () => {
    it('returns 200 to the hookConfig ping without headers', async () => {
      const res = await POST(makeRequest({}, JSON.stringify({ hookConfig: 'ping' })));
      expect(res.status).toBe(200);
    });

    it('returns 200 to the ping with a wrong secret', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'nope' }, JSON.stringify({ hookConfig: 'ping' })));
      expect(res.status).toBe(200);
    });

    it('does not dispatch the ping as an event', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await POST(makeRequest({}, JSON.stringify({ hookConfig: 'ping' })));
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const req = new NextRequest('http://localhost:3000/webhooks/vtex', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', 'x-webhook-secret': SECRET },
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

    it('returns 401, not 400, for invalid JSON without the secret', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('event handling', () => {
    it.each(STATES)('handles %s', async (state) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload(state))));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown states', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload('something-new')))
      );
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });
});
