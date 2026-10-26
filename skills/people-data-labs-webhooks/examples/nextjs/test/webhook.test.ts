import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/people-data-labs/route';
import { verifyPdlRequest } from '../lib/verify-pdl';

const SECRET = 'Bearer pk_test_0123456789';
const IDS = ['9adnit66-hdZ5lkBbq-AOQ_0000', 'YraxDoP16jzyjfxtn-1XJQ_0000', '6Wu6sKeyNfaLF3CVBgoysg_0000'];

beforeAll(() => {
  process.env.PEOPLE_DATA_LABS_WEBHOOK_HEADER = 'Authorization';
  process.env.PEOPLE_DATA_LABS_WEBHOOK_SECRET = SECRET;
});

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(IDS)
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/people-data-labs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });
}

describe('People Data Labs webhook endpoint', () => {
  describe('shared header verification', () => {
    it('accepts the exact header value', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ aUtHoRiZaTiOn: SECRET }));
      expect(res.status).toBe(200);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value', async () => {
      const res = await POST(makeRequest({ Authorization: 'Bearer pk_wrong_0123456789' }));
      expect(res.status).toBe(401);
    });

    it('compares the whole value: the bare token without Bearer is rejected', async () => {
      const res = await POST(makeRequest({ Authorization: 'pk_test_0123456789' }));
      expect(res.status).toBe(401);
    });

    it('rejects a value of different length without throwing', async () => {
      const res = await POST(makeRequest({ Authorization: 'x' }));
      expect(res.status).toBe(401);
    });

    it('rejects when the secret is not configured', () => {
      const headers = new Headers({ Authorization: 'anything' });
      expect(verifyPdlRequest(headers, 'Authorization', '')).toBe(false);
      expect(verifyPdlRequest(headers, 'Authorization', undefined)).toBe(false);
    });

    it('supports a custom header name', () => {
      expect(verifyPdlRequest(new Headers({ 'X-PDL-Key': 'abc123' }), 'x-pdl-key', 'abc123')).toBe(true);
      expect(verifyPdlRequest(new Headers({ Authorization: 'abc123' }), 'x-pdl-key', 'abc123')).toBe(false);
    });
  });

  describe('body handling', () => {
    it('authenticates before parsing (bad body + no header is 401, not 400)', async () => {
      const res = await POST(makeRequest({}, 'not json'));
      expect(res.status).toBe(401);
    });

    it('accepts any content type', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET, 'Content-Type': 'text/plain' }));
      expect(res.status).toBe(200);
    });

    it('accepts an empty batch', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }, '[]'));
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }, 'not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for an object body', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }, JSON.stringify({ ids: IDS })));
      expect(res.status).toBe(400);
    });

    it('returns 400 for an array of non-strings', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }, JSON.stringify([1, 2])));
      expect(res.status).toBe(400);
    });
  });
});
