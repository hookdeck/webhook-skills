import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, PUT, PATCH, GET, DELETE } from '../app/webhooks/formio/route';
import { verifyFormioRequest, parseBasicAuth } from '../lib/verify-formio';

const USERNAME = 'formio-test-user';
const PASSWORD = 'p@ss:word/with:colons';

beforeAll(() => {
  process.env.FORMIO_WEBHOOK_USERNAME = USERNAME;
  process.env.FORMIO_WEBHOOK_PASSWORD = PASSWORD;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

const basic = (user: string, pass: string) =>
  'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
const GOOD = basic(USERNAME, PASSWORD);

// Default payload shape from the Form.io docs: { request, response, submission, params }
const samplePayload = () => {
  const data = { textField: 'Test value', number: 12345, submit: true };
  return {
    request: { data, state: 'submitted', form: '62a745944e836ccf1c0ba167' },
    response: {},
    submission: { _id: '62e052a316f1ad4f786d4038', data, state: 'submitted' },
    params: { formId: '62a745944e836ccf1c0ba167' },
  };
};

function makeRequest(
  method: string,
  auth: string | null = GOOD,
  body: string | null = JSON.stringify(samplePayload()),
  url = 'http://localhost:3000/webhooks/formio'
): NextRequest {
  const headers: Record<string, string> = {};
  if (auth !== null) headers.authorization = auth;
  if (body !== null) headers['content-type'] = 'application/json';
  return new NextRequest(url, { method, headers, ...(body !== null ? { body } : {}) });
}

describe('POST /webhooks/formio', () => {
  describe('HTTP Basic authentication', () => {
    it('accepts the correct credentials', async () => {
      const res = await POST(makeRequest('POST'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true, operation: 'create' });
    });

    it('accepts a lowercase scheme', async () => {
      const res = await POST(makeRequest('POST', GOOD.replace('Basic', 'basic')));
      expect(res.status).toBe(200);
    });

    it('splits on the first colon only (password contains colons)', () => {
      const creds = parseBasicAuth(GOOD)!;
      expect(creds.username.toString()).toBe(USERNAME);
      expect(creds.password.toString()).toBe(PASSWORD);
    });

    it('rejects a wrong password', async () => {
      expect((await POST(makeRequest('POST', basic(USERNAME, 'wrong')))).status).toBe(401);
    });

    it('rejects a wrong username', async () => {
      expect((await POST(makeRequest('POST', basic('someone', PASSWORD)))).status).toBe(401);
    });

    it('rejects credentials of a different length without throwing', async () => {
      expect((await POST(makeRequest('POST', basic('x', 'y')))).status).toBe(401);
    });

    it('rejects a missing Authorization header', async () => {
      const res = await POST(makeRequest('POST', null));
      expect(res.status).toBe(401);
      expect(res.headers.get('www-authenticate')).toMatch(/^Basic/);
    });

    it('rejects a non-Basic scheme', async () => {
      expect((await POST(makeRequest('POST', `Bearer ${PASSWORD}`))).status).toBe(401);
    });

    it('rejects a malformed header (no colon after decoding)', async () => {
      const bad = 'Basic ' + Buffer.from('nocolon').toString('base64');
      expect((await POST(makeRequest('POST', bad))).status).toBe(401);
    });

    it('rejects everything when credentials are not configured', () => {
      const headers = new Headers({ authorization: GOOD });
      expect(verifyFormioRequest(headers, '', '')).toBe(false);
      expect(verifyFormioRequest(headers, USERNAME, '')).toBe(false);
    });

    it('authenticates before parsing the body', async () => {
      expect((await POST(makeRequest('POST', null, 'not json'))).status).toBe(401);
    });
  });

  describe('HTTP methods', () => {
    it.each([
      ['POST', POST, 'create'],
      ['PUT', PUT, 'update'],
      ['PATCH', PATCH, 'update'],
      ['DELETE', DELETE, 'delete'],
    ])('%s maps to %s', async (method, fn, operation) => {
      const res = await fn(makeRequest(method));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true, operation });
    });

    it('accepts GET with no body', async () => {
      const res = await GET(makeRequest('GET', GOOD, null));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true, operation: 'read' });
    });

    it('accepts DELETE with no body and params in the query string', async () => {
      const res = await DELETE(
        makeRequest('DELETE', GOOD, null, 'http://localhost:3000/webhooks/formio?submissionId=62e052a316f1ad4f786d4038')
      );
      expect(res.status).toBe(200);
      expect((await res.json()).operation).toBe('delete');
    });

    it('rejects an unauthenticated GET', async () => {
      expect((await GET(makeRequest('GET', null, null))).status).toBe(401);
    });
  });

  describe('body handling', () => {
    it('accepts a JSON body sent with a non-JSON content type', async () => {
      const req = new NextRequest('http://localhost:3000/webhooks/formio', {
        method: 'POST',
        headers: { authorization: GOOD, 'content-type': 'text/plain' },
        body: JSON.stringify(samplePayload()),
      });
      expect((await POST(req)).status).toBe(200);
    });

    it('rejects invalid JSON after authentication', async () => {
      expect((await POST(makeRequest('POST', GOOD, '{oops'))).status).toBe(400);
    });

    it('rejects a JSON array', async () => {
      expect((await POST(makeRequest('POST', GOOD, '[1,2]'))).status).toBe(400);
    });

    it('accepts a payload with no submission', async () => {
      expect((await PUT(makeRequest('PUT', GOOD, '{}'))).status).toBe(200);
    });
  });
});
