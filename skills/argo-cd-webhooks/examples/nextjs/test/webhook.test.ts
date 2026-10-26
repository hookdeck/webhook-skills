import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, PUT, PATCH, DELETE } from '../app/webhooks/argo-cd/route';
import { verifyArgoCdRequest } from '../lib/verify-argo-cd';

const HEADER = 'X-Argo-Secret';
const SECRET = 'test_argo_cd_secret_0123456789';
const URL = 'http://localhost:3000/webhooks/argo-cd';

const HANDLERS = { GET, POST, PUT, PATCH, DELETE };
const TRIGGERS = ['on-sync-succeeded', 'on-sync-failed', 'on-health-degraded'];

beforeAll(() => {
  process.env.ARGO_CD_WEBHOOK_HEADER = HEADER;
  process.env.ARGO_CD_WEBHOOK_SECRET = SECRET;
});

// Illustrative payload from the template in references/setup.md.
function payloadFor(trigger: string) {
  return { trigger, app: 'guestbook', sync_status: 'Synced', health: 'Healthy' };
}

function makeRequest(
  method: string,
  headers: Record<string, string> = {},
  body?: string
): NextRequest {
  const hasBody = body !== undefined && method !== 'GET';
  return new NextRequest(URL, {
    method,
    headers: { ...(hasBody ? { 'content-type': 'application/json' } : {}), ...headers },
    body: hasBody ? body : undefined,
  });
}

const okBody = JSON.stringify(payloadFor('on-sync-succeeded'));

describe('credential verification', () => {
  it('accepts the correct header value', async () => {
    const res = await POST(makeRequest('POST', { [HEADER]: SECRET }, okBody));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('matches the header name case-insensitively', async () => {
    const res = await POST(makeRequest('POST', { 'x-argo-secret': SECRET }, okBody));
    expect(res.status).toBe(200);
  });

  it('rejects a wrong value of the same length', async () => {
    const res = await POST(makeRequest('POST', { [HEADER]: 'x'.repeat(SECRET.length) }, '{}'));
    expect(res.status).toBe(401);
  });

  it('rejects a value of a different length without throwing', async () => {
    const res = await POST(makeRequest('POST', { [HEADER]: 'short' }, '{}'));
    expect(res.status).toBe(401);
  });

  it('rejects a missing header', async () => {
    const res = await POST(makeRequest('POST', {}, okBody));
    expect(res.status).toBe(401);
  });

  it('does not accept the secret in a different header', async () => {
    const res = await POST(makeRequest('POST', { Authorization: SECRET }, '{}'));
    expect(res.status).toBe(401);
  });

  it('compares the whole value and does not strip a Bearer prefix', () => {
    const bearer = `Bearer ${SECRET}`;
    const h = new Headers({ authorization: bearer });
    expect(verifyArgoCdRequest(h, bearer, 'Authorization')).toBe(true);
    expect(verifyArgoCdRequest(h, SECRET, 'Authorization')).toBe(false);
    expect(verifyArgoCdRequest(new Headers({ authorization: SECRET }), bearer, 'Authorization')).toBe(false);
  });

  it('rejects everything when no secret is configured', () => {
    const h = new Headers({ 'x-argo-secret': SECRET });
    expect(verifyArgoCdRequest(h, '', HEADER)).toBe(false);
    expect(verifyArgoCdRequest(h, SECRET, HEADER)).toBe(true);
  });
});

describe('methods', () => {
  it.each(Object.keys(HANDLERS))('accepts %s with the credential', async (method) => {
    const handler = HANDLERS[method as keyof typeof HANDLERS];
    const res = await handler(makeRequest(method, { [HEADER]: SECRET }, okBody));
    expect(res.status).toBe(200);
  });

  it.each(Object.keys(HANDLERS))('checks the credential first on %s', async (method) => {
    const handler = HANDLERS[method as keyof typeof HANDLERS];
    const res = await handler(makeRequest(method, {}, okBody));
    expect(res.status).toBe(401);
  });

  it('handles an empty GET (the Argo CD default) as success', async () => {
    const res = await GET(makeRequest('GET', { [HEADER]: SECRET }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('handles an empty POST body', async () => {
    const res = await POST(makeRequest('POST', { [HEADER]: SECRET }));
    expect(res.status).toBe(200);
  });
});

describe('body handling', () => {
  it('accepts any content type', async () => {
    const req = new NextRequest(URL, {
      method: 'POST',
      headers: { 'content-type': 'text/plain', [HEADER]: SECRET },
      body: okBody,
    });
    expect((await POST(req)).status).toBe(200);
  });

  it('returns 400 for invalid JSON after authenticating', async () => {
    const res = await POST(makeRequest('POST', { [HEADER]: SECRET }, '{not json'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a non-object JSON body', async () => {
    const res = await POST(makeRequest('POST', { [HEADER]: SECRET }, '[1,2]'));
    expect(res.status).toBe(400);
  });

  it('returns 401, not 400, for invalid JSON without the credential', async () => {
    const res = await POST(makeRequest('POST', {}, '{not json'));
    expect(res.status).toBe(401);
  });
});

describe('notification handling', () => {
  it.each(TRIGGERS)('handles %s', async (trigger) => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await POST(
      makeRequest('POST', { [HEADER]: SECRET }, JSON.stringify(payloadFor(trigger)))
    );
    expect(res.status).toBe(200);
    expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
    spy.mockRestore();
  });

  it('acknowledges unknown triggers', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await POST(
      makeRequest('POST', { [HEADER]: SECRET }, JSON.stringify(payloadFor('on-something-new')))
    );
    expect(res.status).toBe(200);
    spy.mockRestore();
  });
});
