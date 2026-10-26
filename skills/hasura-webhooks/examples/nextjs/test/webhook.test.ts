import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/hasura/route';
import { verifyHasuraRequest } from '../lib/verify-hasura';

const HEADER = 'X-Webhook-Secret';
const SECRET = 'Bearer test_hasura_secret_0123456789';

const OPS = ['INSERT', 'UPDATE', 'DELETE', 'MANUAL'];

beforeAll(() => {
  process.env.HASURA_WEBHOOK_HEADER = HEADER;
  process.env.HASURA_WEBHOOK_SECRET = SECRET;
});

function samplePayload(op = 'INSERT') {
  return {
    created_at: '2020-07-29T10:00:00.000Z',
    delivery_info: { current_retry: 0, max_retries: 0 },
    event: {
      data: { new: op === 'DELETE' ? null : { id: 1, name: 'John' }, old: op === 'INSERT' || op === 'MANUAL' ? null : { id: 1, name: 'Jane' } },
      op,
      session_variables: { 'x-hasura-role': 'admin' },
      trace_context: { span_id: '123', trace_id: '456' },
    },
    id: '123e4567-e89b-12d3-a456-426614174000',
    table: { name: 'users', schema: 'public' },
    trigger: { name: 'insert_user' },
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload())
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/hasura', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('POST /webhooks/hasura', () => {
  describe('Secret header verification', () => {
    it('accepts the correct header value', async () => {
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

    it('ignores the secret sent under a different header name', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(401);
    });

    it('defaults the header name to Authorization', () => {
      const headers = new Headers({ authorization: 'abc' });
      const saved = process.env.HASURA_WEBHOOK_HEADER;
      delete process.env.HASURA_WEBHOOK_HEADER;
      expect(verifyHasuraRequest(headers, { secret: 'abc' })).toBe(true);
      process.env.HASURA_WEBHOOK_HEADER = saved;
    });

    it('rejects everything when no secret is configured', () => {
      const headers = new Headers({ [HEADER]: SECRET });
      expect(verifyHasuraRequest(headers, { secret: '' })).toBe(false);
      expect(verifyHasuraRequest(headers, { secret: SECRET })).toBe(true);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type', async () => {
      const req = new NextRequest('http://localhost:3000/webhooks/hasura', {
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

    it('returns 400 when event.op is missing', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify({ event: {} })));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(OPS)('handles %s', async (op) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload(op))));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown ops', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload('SOMETHING_NEW')))
      );
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });
});
