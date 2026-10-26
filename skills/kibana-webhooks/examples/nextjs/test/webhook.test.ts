import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, PUT, PATCH, DELETE } from '../app/webhooks/kibana/route';
import { verifyBasicAuth } from '../lib/verify-kibana';

const USERNAME = 'kibana_user';
const PASSWORD = 'p@ss:word:with:colons';

beforeAll(() => {
  process.env.KIBANA_WEBHOOK_USERNAME = USERNAME;
  process.env.KIBANA_WEBHOOK_PASSWORD = PASSWORD;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const basic = (user: string, pass: string) =>
  'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');

// Illustrative rule action template output (not a vendor schema)
const FIRED = JSON.stringify({ rule: 'High CPU', status: 'query matched', context: 'CPU above 90%' });
const RECOVERED = JSON.stringify({ rule: 'High CPU', status: 'recovered', context: 'CPU back to normal' });

const handlers = { GET, POST, PUT, PATCH, DELETE };

function makeRequest(method: string, headers: Record<string, string> = {}, body?: string) {
  const hasBody = body !== undefined && method !== 'GET';
  return new NextRequest('http://localhost:3000/webhooks/kibana', {
    method,
    headers: hasBody ? { 'content-type': 'application/json', ...headers } : headers,
    body: hasBody ? body : undefined,
  });
}

describe('Kibana webhook route', () => {
  describe('Basic authentication', () => {
    it('accepts valid credentials', async () => {
      const res = await POST(makeRequest('POST', { authorization: basic(USERNAME, PASSWORD) }, FIRED));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts the scheme in any case', async () => {
      const header = basic(USERNAME, PASSWORD).replace('Basic', 'bAsIc');
      const res = await POST(makeRequest('POST', { authorization: header }, FIRED));
      expect(res.status).toBe(200);
    });

    it('accepts a recovered action', async () => {
      const res = await POST(makeRequest('POST', { authorization: basic(USERNAME, PASSWORD) }, RECOVERED));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong password', async () => {
      const res = await POST(makeRequest('POST', { authorization: basic(USERNAME, 'wrong') }, FIRED));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong username', async () => {
      const res = await POST(makeRequest('POST', { authorization: basic('other', PASSWORD) }, FIRED));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest('POST', {}, FIRED));
      expect(res.status).toBe(401);
    });

    it('rejects a non-Basic scheme', async () => {
      const res = await POST(makeRequest('POST', { authorization: 'Bearer abc' }, FIRED));
      expect(res.status).toBe(401);
    });

    it('rejects malformed base64', async () => {
      const res = await POST(makeRequest('POST', { authorization: 'Basic !!!not-base64!!!' }, FIRED));
      expect(res.status).toBe(401);
    });

    it('rejects valid credentials followed by junk', async () => {
      const res = await POST(makeRequest('POST', { authorization: basic(USERNAME, PASSWORD) + '!!!!' }, FIRED));
      expect(res.status).toBe(401);
    });

    it('rejects credentials without a colon', async () => {
      const header = 'Basic ' + Buffer.from('nocolon').toString('base64');
      const res = await POST(makeRequest('POST', { authorization: header }, FIRED));
      expect(res.status).toBe(401);
    });

    it('does not send a WWW-Authenticate challenge', async () => {
      const res = await POST(makeRequest('POST', {}, FIRED));
      expect(res.headers.get('www-authenticate')).toBeNull();
    });

    it('rejects everything when credentials are not configured', () => {
      expect(verifyBasicAuth(basic('', ''), '', '')).toBe(false);
      expect(verifyBasicAuth(basic(USERNAME, PASSWORD), '', '')).toBe(false);
    });
  });

  describe('methods', () => {
    it.each(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const)('accepts %s with an empty body', async (method) => {
      const res = await handlers[method](makeRequest(method, { authorization: basic(USERNAME, PASSWORD) }));
      expect(res.status).toBe(200);
    });

    it.each(['POST', 'PUT', 'PATCH', 'DELETE'] as const)('accepts %s with a JSON body', async (method) => {
      const res = await handlers[method](makeRequest(method, { authorization: basic(USERNAME, PASSWORD) }, FIRED));
      expect(res.status).toBe(200);
    });

    it.each(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const)('checks the credential first for %s', async (method) => {
      const res = await handlers[method](makeRequest(method, { authorization: basic(USERNAME, 'wrong') }));
      expect(res.status).toBe(401);
    });
  });

  describe('body handling', () => {
    it('keeps non-JSON text', async () => {
      const req = new NextRequest('http://localhost:3000/webhooks/kibana', {
        method: 'POST',
        headers: { authorization: basic(USERNAME, PASSWORD), 'content-type': 'text/plain' },
        body: 'Rule High CPU fired',
      });
      expect((await POST(req)).status).toBe(200);
    });

    it('handles a JSON array without crashing', async () => {
      const res = await POST(makeRequest('POST', { authorization: basic(USERNAME, PASSWORD) }, '[1,2]'));
      expect(res.status).toBe(200);
    });
  });
});
