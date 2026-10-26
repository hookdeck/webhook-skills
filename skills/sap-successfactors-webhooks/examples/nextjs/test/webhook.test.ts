import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '../app/webhooks/sap-successfactors/route';
import { parseBasicAuth, verifySapSuccessFactorsRequest } from '../lib/verify-sap-successfactors';

const USER = 'sf_integration';
const PASS = 'p@ss:word-with-colon';

beforeAll(() => {
  process.env.SAP_SUCCESSFACTORS_WEBHOOK_USERNAME = USER;
  process.env.SAP_SUCCESSFACTORS_WEBHOOK_PASSWORD = PASS;
});

function basic(user = USER, pass = PASS, scheme = 'Basic'): string {
  return `${scheme} ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

// Illustrative payload: SAP SuccessFactors sends whatever fields the integration maps.
const JSON_BODY = JSON.stringify({ userId: 'example-1001', firstName: 'Ada', department: 'Engineering' });
const XML_BODY = '<Employee><userId>example-1001</userId></Employee>';

function makePost(auth?: string, body: string = JSON_BODY, contentType = 'application/json'): NextRequest {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (auth) headers.authorization = auth;
  return new NextRequest('http://localhost:3000/webhooks/sap-successfactors', {
    method: 'POST',
    headers,
    body: body === '' ? undefined : body,
  });
}

function makeGet(auth?: string): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/sap-successfactors', {
    method: 'GET',
    headers: auth ? { authorization: auth } : {},
  });
}

describe('SAP SuccessFactors webhook route', () => {
  describe('Basic authentication', () => {
    it('accepts the correct credentials', async () => {
      const res = await POST(makePost(basic()));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true, format: 'json' });
    });

    it('accepts the scheme in any case', async () => {
      expect((await POST(makePost(basic(USER, PASS, 'basic')))).status).toBe(200);
      expect((await POST(makePost(basic(USER, PASS, 'BASIC')))).status).toBe(200);
    });

    it('splits on the first colon only', () => {
      expect(parseBasicAuth(basic('a', 'b:c:d'))).toEqual({ username: 'a', password: 'b:c:d' });
    });

    it('rejects a wrong password, wrong username, or both', async () => {
      expect((await POST(makePost(basic(USER, 'wrong')))).status).toBe(401);
      expect((await POST(makePost(basic('someone', PASS)))).status).toBe(401);
      expect((await POST(makePost(basic('x', 'y')))).status).toBe(401);
    });

    it('rejects a missing header and other schemes', async () => {
      expect((await POST(makePost())).status).toBe(401);
      expect((await POST(makePost(`Bearer ${PASS}`))).status).toBe(401);
    });

    it('rejects credentials followed by junk', async () => {
      expect((await POST(makePost(`${basic()}!!`))).status).toBe(401);
      expect((await POST(makePost(`${basic()} extra`))).status).toBe(401);
    });

    it('rejects non-base64 characters and a missing colon', async () => {
      expect((await POST(makePost('Basic not*base64'))).status).toBe(401);
      expect((await POST(makePost(`Basic ${Buffer.from('nocolon').toString('base64')}`))).status).toBe(401);
    });

    it('rejects when credentials are not configured', () => {
      const headers = new Headers({ authorization: basic() });
      expect(verifySapSuccessFactorsRequest(headers, '', '')).toBe(false);
      expect(verifySapSuccessFactorsRequest(headers, undefined as unknown as string, '')).toBe(false);
    });

    it('does not throw on non-ASCII credentials', async () => {
      expect((await POST(makePost(basic('üser', 'pässword')))).status).toBe(401);
    });
  });

  describe('methods and bodies', () => {
    it('accepts GET with no body', async () => {
      const res = await GET(makeGet(basic()));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true, format: 'empty' });
    });

    it('rejects an unauthenticated GET', async () => {
      expect((await GET(makeGet())).status).toBe(401);
    });

    it('accepts an empty POST body', async () => {
      const res = await POST(makePost(basic(), ''));
      expect(res.status).toBe(200);
      expect((await res.json()).format).toBe('empty');
    });

    it('keeps XML as text', async () => {
      const res = await POST(makePost(basic(), XML_BODY, 'application/xml'));
      expect((await res.json()).format).toBe('xml');
    });

    it('accepts +json and unknown content types', async () => {
      expect((await (await POST(makePost(basic(), JSON_BODY, 'application/vnd.sap+json'))).json()).format).toBe('json');
      expect((await (await POST(makePost(basic(), 'a,b,c', 'text/csv'))).json()).format).toBe('text');
    });

    it('returns 400 for malformed JSON when the content type says JSON', async () => {
      expect((await POST(makePost(basic(), '{oops'))).status).toBe(400);
    });

    it('authenticates before parsing (bad JSON + bad auth is 401)', async () => {
      expect((await POST(makePost(basic(USER, 'wrong'), '{oops'))).status).toBe(401);
    });
  });
});
