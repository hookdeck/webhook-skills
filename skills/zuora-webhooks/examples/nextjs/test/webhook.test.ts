import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, PUT, PATCH, GET, DELETE } from '../app/webhooks/zuora/route';
import { verifyZuoraRequest, parseBasicAuth } from '../lib/verify-zuora';

const USER = 'zuora-callout';
const PASS = 'p@ss:w0rd:with:colons';

beforeAll(() => {
  process.env.ZUORA_WEBHOOK_USERNAME = USER;
  process.env.ZUORA_WEBHOOK_PASSWORD = PASS;
});

function basic(user = USER, pass = PASS, scheme = 'Basic'): string {
  return `${scheme} ${Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')}`;
}

const GOOD = basic();

// Illustrative body: Zuora adds no event field, the callout template defines the body.
function samplePayload(event = 'PaymentProcessed') {
  return { event, accountId: '2c92c0f8-0000-0000-0000-000000000001', invoiceNumber: 'INV00000123' };
}

function makeRequest(
  method: string,
  headers: Record<string, string> = {},
  body: string | null = JSON.stringify(samplePayload()),
  url = 'http://localhost:3000/webhooks/zuora'
): NextRequest {
  const init: { method: string; headers: Record<string, string>; body?: string } = {
    method,
    headers: { 'content-type': 'application/json', ...headers },
  };
  if (body !== null && method !== 'GET') init.body = body;
  return new NextRequest(url, init);
}

describe('/webhooks/zuora', () => {
  describe('Basic auth verification', () => {
    it('accepts correct credentials', async () => {
      const res = await POST(makeRequest('POST', { Authorization: GOOD }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true, success: true });
    });

    it('matches the scheme case-insensitively', async () => {
      for (const scheme of ['basic', 'BASIC']) {
        const res = await POST(makeRequest('POST', { Authorization: basic(USER, PASS, scheme) }));
        expect(res.status).toBe(200);
      }
    });

    it('splits on the first colon, so the password may contain colons', () => {
      const creds = parseBasicAuth(GOOD);
      expect(creds?.username.toString()).toBe(USER);
      expect(creds?.password.toString()).toBe(PASS);
    });

    it('accepts a non-ASCII password', () => {
      const headers = new Headers({ authorization: basic(USER, 'pässwörd-日本') });
      expect(verifyZuoraRequest(headers, USER, 'pässwörd-日本')).toBe(true);
    });

    it('rejects a wrong password', async () => {
      const res = await POST(makeRequest('POST', { Authorization: basic(USER, 'wrong') }));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong username', async () => {
      const res = await POST(makeRequest('POST', { Authorization: basic('someone-else', PASS) }));
      expect(res.status).toBe(401);
    });

    it('rejects when both are wrong, including different lengths, without throwing', async () => {
      const res = await POST(makeRequest('POST', { Authorization: basic('x', 'y') }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header and sends a Basic challenge', async () => {
      const res = await POST(makeRequest('POST'));
      expect(res.status).toBe(401);
      expect(res.headers.get('www-authenticate')).toMatch(/^Basic/);
    });

    it('rejects malformed headers', async () => {
      const good64 = Buffer.from(`${USER}:${PASS}`).toString('base64');
      const bad = [
        'Basic',
        'Basic ',
        `Bearer ${good64}`,
        'Basic !!!not-base64!!!',
        `Basic ${Buffer.from('no-colon-here').toString('base64')}`,
        `Basic ${good64} extra`,
        `${USER}:${PASS}`,
      ];
      for (const header of bad) {
        const res = await POST(makeRequest('POST', { Authorization: header }));
        expect(res.status).toBe(401);
      }
    });

    it('rejects everything when the credentials are unset', () => {
      const headers = new Headers({ authorization: GOOD });
      expect(verifyZuoraRequest(headers, '', '')).toBe(false);
      expect(verifyZuoraRequest(headers, USER, '')).toBe(false);
      expect(verifyZuoraRequest(headers, '', PASS)).toBe(false);
      vi.stubEnv('ZUORA_WEBHOOK_USERNAME', '');
      vi.stubEnv('ZUORA_WEBHOOK_PASSWORD', '');
      expect(verifyZuoraRequest(headers)).toBe(false);
      vi.unstubAllEnvs();
    });

    it('authenticates before parsing the body', async () => {
      const res = await POST(makeRequest('POST', {}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('HTTP methods', () => {
    it('accepts POST, PUT, PATCH and DELETE with a JSON body', async () => {
      for (const [method, handler] of [
        ['POST', POST], ['PUT', PUT], ['PATCH', PATCH], ['DELETE', DELETE],
      ] as const) {
        const res = await handler(makeRequest(method, { Authorization: GOOD }));
        expect(res.status).toBe(200);
      }
    });

    it('accepts GET with an empty body and reads merge fields from the query', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await GET(
        makeRequest('GET', { Authorization: GOOD }, null,
          'http://localhost:3000/webhooks/zuora?event=InvoicePosted&accountId=abc')
      );
      expect(res.status).toBe(200);
      expect(spy).toHaveBeenCalledWith('Invoice posted for account abc');
      spy.mockRestore();
    });

    it('accepts a POST with no body', async () => {
      const res = await POST(makeRequest('POST', { Authorization: GOOD }, ''));
      expect(res.status).toBe(200);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type', async () => {
      for (const type of ['text/plain', 'application/octet-stream', 'application/vnd.api+json']) {
        const res = await POST(makeRequest('POST', { Authorization: GOOD, 'content-type': type }));
        expect(res.status).toBe(200);
      }
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await POST(makeRequest('POST', { Authorization: GOOD }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a JSON body that is not an object', async () => {
      const res = await POST(makeRequest('POST', { Authorization: GOOD }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it.each(['PaymentProcessed', 'InvoicePosted', 'SomethingElse'])('handles the %s event', async (event) => {
      const res = await POST(
        makeRequest('POST', { Authorization: GOOD }, JSON.stringify(samplePayload(event)))
      );
      expect(res.status).toBe(200);
    });
  });
});
