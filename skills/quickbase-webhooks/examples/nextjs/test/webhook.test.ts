import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, PUT, PATCH, GET, DELETE } from '../app/webhooks/quickbase/route';
import { verifyQuickbaseRequest } from '../lib/verify-quickbase';

const SECRET = 'Bearer test_quickbase_secret_0123456789';

// Illustrative payloads: Quickbase adds no event field; these are user-written templates.
const EVENTS = ['record_added', 'record_modified', 'record_deleted'];

beforeAll(() => {
  process.env.QUICKBASE_WEBHOOK_SECRET = SECRET;
  delete process.env.QUICKBASE_WEBHOOK_HEADER;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.QUICKBASE_WEBHOOK_HEADER;
});

function sample(event = 'record_added') {
  return { event, record_id: 42, table: 'Projects' };
}

function makeRequest(
  method: string,
  headers: Record<string, string> = {},
  body?: string
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/quickbase', {
    method,
    headers: body === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
    body,
  });
}

const json = (event = 'record_added') => JSON.stringify(sample(event));

describe('Quickbase webhook route', () => {
  describe('secret header verification', () => {
    it('accepts the correct whole value in the default Authorization header', async () => {
      const res = await POST(makeRequest('POST', { Authorization: SECRET }, json()));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest('POST', { authorization: SECRET }, json()));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await POST(makeRequest('POST', { Authorization: 'x'.repeat(SECRET.length) }, json()));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await POST(makeRequest('POST', { Authorization: 'short' }, json()));
      expect(res.status).toBe(401);
    });

    it('rejects the value with the Bearer prefix stripped (whole value is compared)', async () => {
      const res = await POST(makeRequest('POST', { Authorization: SECRET.replace('Bearer ', '') }, json()));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest('POST', {}, json()));
      expect(res.status).toBe(401);
    });

    it('rejects before parsing: invalid body with a bad secret is 401', async () => {
      const res = await POST(makeRequest('POST', { Authorization: 'nope' }, '{not json'));
      expect(res.status).toBe(401);
    });

    it('reads the header name from QUICKBASE_WEBHOOK_HEADER', async () => {
      process.env.QUICKBASE_WEBHOOK_HEADER = 'X-Qb-Secret';
      const ok = await POST(makeRequest('POST', { 'x-qb-secret': SECRET }, json()));
      expect(ok.status).toBe(200);
      const wrongHeader = await POST(makeRequest('POST', { Authorization: SECRET }, json()));
      expect(wrongHeader.status).toBe(401);
    });

    it('rejects everything when the secret is not configured', () => {
      const headers = new Headers({ Authorization: 'anything' });
      expect(verifyQuickbaseRequest(headers, '')).toBe(false);
      expect(verifyQuickbaseRequest(headers, undefined as unknown as string)).toBe(false);
    });
  });

  describe('HTTP methods', () => {
    it.each([
      ['POST', POST],
      ['PUT', PUT],
      ['PATCH', PATCH],
    ])('accepts %s with a body', async (method, handler) => {
      const res = await handler(makeRequest(method, { Authorization: SECRET }, json()));
      expect(res.status).toBe(200);
    });

    it.each([
      ['GET', GET],
      ['DELETE', DELETE],
    ])('accepts %s with an empty body', async (method, handler) => {
      const res = await handler(makeRequest(method, { Authorization: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it.each([
      ['GET', GET],
      ['DELETE', DELETE],
    ])('rejects unauthenticated %s', async (method, handler) => {
      const res = await handler(makeRequest(method));
      expect(res.status).toBe(401);
    });
  });

  describe('bodies', () => {
    it.each(EVENTS)('handles illustrative %s payloads', async (event) => {
      const res = await POST(makeRequest('POST', { Authorization: SECRET }, json(event)));
      expect(res.status).toBe(200);
    });

    it('acknowledges unrecognized events', async () => {
      const res = await POST(makeRequest('POST', { Authorization: SECRET }, JSON.stringify({ event: 'other' })));
      expect(res.status).toBe(200);
    });

    it('accepts an XML body', async () => {
      const res = await POST(
        makeRequest('POST', { Authorization: SECRET, 'Content-Type': 'application/xml' }, '<record><id>42</id></record>')
      );
      expect(res.status).toBe(200);
    });

    it('accepts a RAW text body', async () => {
      const res = await POST(
        makeRequest('POST', { Authorization: SECRET, 'Content-Type': 'text/plain' }, 'record 42 changed')
      );
      expect(res.status).toBe(200);
    });

    it('accepts malformed JSON as an opaque body once authenticated', async () => {
      const res = await POST(makeRequest('POST', { Authorization: SECRET }, '{not json'));
      expect(res.status).toBe(200);
    });
  });
});
