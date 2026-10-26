import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/proxyclick/route';
import { parseBasicAuth, verifyProxyclickRequest } from '../lib/verify-proxyclick';

const USERNAME = 'proxyclick';
const PASSWORD = 'p@ss:word-with-colon';

beforeAll(() => {
  process.env.PROXYCLICK_WEBHOOK_USERNAME = USERNAME;
  process.env.PROXYCLICK_WEBHOOK_PASSWORD = PASSWORD;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

// ILLUSTRATIVE body: Proxyclick's attribute reference is not documented here, so
// this is NOT its real schema. Only the Basic credential check is under test.
const illustrative = { visitor: { firstName: 'Ada' }, visit: { id: 'illustrative-1' } };

const basic = (user: string, pass: string) =>
  'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(illustrative),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/proxyclick', {
    method: 'POST',
    headers: { 'Content-Type': contentType, ...headers },
    body,
  });
}

describe('Proxyclick webhook route', () => {
  it('accepts correct Basic credentials', async () => {
    const res = await POST(makeRequest({ Authorization: basic(USERNAME, PASSWORD) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts a lowercase scheme and a password containing colons', async () => {
    const res = await POST(makeRequest({ Authorization: basic(USERNAME, PASSWORD).replace('Basic', 'basic') }));
    expect(res.status).toBe(200);
  });

  it('rejects a missing Authorization header', async () => {
    expect((await POST(makeRequest())).status).toBe(401);
  });

  it('rejects a wrong password and a wrong username', async () => {
    expect((await POST(makeRequest({ Authorization: basic(USERNAME, 'nope') }))).status).toBe(401);
    expect((await POST(makeRequest({ Authorization: basic('other', PASSWORD) }))).status).toBe(401);
  });

  it('rejects a non-Basic scheme', async () => {
    expect((await POST(makeRequest({ Authorization: `Bearer ${PASSWORD}` }))).status).toBe(401);
  });

  it('rejects malformed base64 and credentials without a colon', async () => {
    expect((await POST(makeRequest({ Authorization: 'Basic !!!notbase64' }))).status).toBe(401);
    const noColon = 'Basic ' + Buffer.from('justausername').toString('base64');
    expect((await POST(makeRequest({ Authorization: noColon }))).status).toBe(401);
  });

  it('does not send a WWW-Authenticate challenge', async () => {
    const res = await POST(makeRequest());
    expect(res.headers.get('www-authenticate')).toBeNull();
  });

  it('authenticates regardless of content type', async () => {
    const res = await POST(makeRequest({ Authorization: basic(USERNAME, PASSWORD) }, JSON.stringify(illustrative), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON and for a JSON array', async () => {
    const auth = { Authorization: basic(USERNAME, PASSWORD) };
    expect((await POST(makeRequest(auth, 'not json'))).status).toBe(400);
    expect((await POST(makeRequest(auth, '[1,2]'))).status).toBe(400);
  });
});

describe('helpers', () => {
  it('parses credentials on the first colon', () => {
    expect(parseBasicAuth(basic('a', 'b:c'))).toEqual({ username: 'a', password: 'b:c' });
    expect(parseBasicAuth(null)).toBeNull();
  });

  it('never accepts when credentials are unset', () => {
    const headers = new Headers({ Authorization: basic(USERNAME, PASSWORD) });
    expect(verifyProxyclickRequest(headers, {})).toBe(false);
    expect(verifyProxyclickRequest(headers, { PROXYCLICK_WEBHOOK_USERNAME: USERNAME })).toBe(false);
  });
});
