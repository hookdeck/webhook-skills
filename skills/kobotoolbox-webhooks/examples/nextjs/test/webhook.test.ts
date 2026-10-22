import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/kobotoolbox/route';
import { verifyKoboRequest, parseBasicAuth } from '../lib/verify-kobotoolbox';

const USER = 'kobo-hook';
const PASS = 'p@ss:word/with:colons';

beforeAll(() => {
  process.env.KOBOTOOLBOX_WEBHOOK_USERNAME = USER;
  process.env.KOBOTOOLBOX_WEBHOOK_PASSWORD = PASS;
});

function basic(user: string, pass: string, scheme = 'Basic'): string {
  return `${scheme} ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

const SUBMISSION = {
  _id: 1234,
  _uuid: '1f4f1a52-3c1e-4d0b-9a55-0c1f0e2a7a11',
  _submission_time: '2026-10-22T09:30:00',
  _xform_id_string: 'aXyZ123',
  name: 'Amina',
  age: '34',
};

const XML = '<aXyZ123 id="aXyZ123"><name>Amina</name><age>34</age></aXyZ123>';

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(SUBMISSION),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/kobotoolbox', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/kobotoolbox', () => {
  describe('Basic auth verification', () => {
    it('accepts the correct credentials', async () => {
      const res = await POST(makeRequest({ Authorization: basic(USER, PASS) }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts the scheme case-insensitively', async () => {
      const res = await POST(makeRequest({ Authorization: basic(USER, PASS, 'basic') }));
      expect(res.status).toBe(200);
    });

    it('splits on the first colon only', () => {
      const creds = parseBasicAuth(basic('u', 'a:b:c'));
      expect(creds?.username.toString()).toBe('u');
      expect(creds?.password.toString()).toBe('a:b:c');
    });

    it('rejects a wrong password', async () => {
      const res = await POST(makeRequest({ Authorization: basic(USER, 'wrong') }));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong username', async () => {
      const res = await POST(makeRequest({ Authorization: basic('someone', PASS) }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects a non-Basic scheme', async () => {
      const res = await POST(makeRequest({ Authorization: `Bearer ${PASS}` }));
      expect(res.status).toBe(401);
    });

    it('rejects malformed base64 and a missing colon', async () => {
      expect((await POST(makeRequest({ Authorization: 'Basic !!!notbase64' }))).status).toBe(401);
      const noColon = `Basic ${Buffer.from('nocolonhere').toString('base64')}`;
      expect((await POST(makeRequest({ Authorization: noColon }))).status).toBe(401);
    });

    it('rejects everything when credentials are unconfigured', () => {
      const headers = new Headers({ authorization: basic(USER, PASS) });
      expect(verifyKoboRequest(headers, '', '')).toBe(false);
      expect(verifyKoboRequest(headers, USER, '')).toBe(false);
      expect(verifyKoboRequest(headers, USER, PASS)).toBe(true);
    });

    it('handles non-ASCII credentials', () => {
      const headers = new Headers({ authorization: basic('üser', 'pässwörd') });
      expect(verifyKoboRequest(headers, 'üser', 'pässwörd')).toBe(true);
      expect(verifyKoboRequest(headers, 'user', 'pässwörd')).toBe(false);
    });
  });

  describe('Body handling', () => {
    it('accepts a JSON submission', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ Authorization: basic(USER, PASS) }));
      expect(res.status).toBe(200);
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('New submission 1234'));
      spy.mockRestore();
    });

    it('accepts an XML submission', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ Authorization: basic(USER, PASS) }, XML, 'application/xml'));
      expect(res.status).toBe(200);
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('xml/text'));
      spy.mockRestore();
    });

    it('accepts JSON sent with any content type', async () => {
      const res = await POST(
        makeRequest({ Authorization: basic(USER, PASS) }, JSON.stringify(SUBMISSION), 'text/plain')
      );
      expect(res.status).toBe(200);
    });

    it('accepts a custom JSON wrapper', async () => {
      const res = await POST(
        makeRequest({ Authorization: basic(USER, PASS) }, JSON.stringify({ source: 'kobo', data: SUBMISSION }))
      );
      expect(res.status).toBe(200);
    });

    it('returns 401 for an XML body without credentials', async () => {
      const res = await POST(makeRequest({}, XML, 'application/xml'));
      expect(res.status).toBe(401);
    });
  });
});
