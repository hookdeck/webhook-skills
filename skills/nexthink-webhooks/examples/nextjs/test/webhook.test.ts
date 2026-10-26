import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, PUT, PATCH } from '../app/webhooks/nexthink/route';
import { verifyNexthinkRequest } from '../lib/verify-nexthink';

const AUTH = 'Bearer 7f3c9a1e-5b2d-4e68-8a40-d1c2b3a49586';

beforeAll(() => {
  process.env.NEXTHINK_AUTHORIZATION = AUTH;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

// Illustrative template: Nexthink adds no event field; "event" is chosen by the template author
const triggered = { event: 'alert triggered', monitor: 'High CPU (illustrative)' };
const recovered = { event: 'alert recovered', monitor: 'High CPU (illustrative)' };

function makeRequest(
  method: string,
  headers: Record<string, string> = {},
  body: string | undefined = JSON.stringify(triggered),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/nexthink', {
    method,
    headers: { 'Content-Type': contentType, ...headers },
    body,
  });
}

describe('Nexthink webhook route', () => {
  it('accepts the full Authorization header value', async () => {
    const res = await POST(makeRequest('POST', { Authorization: AUTH }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts PUT and PATCH', async () => {
    const body = JSON.stringify(recovered);
    expect((await PUT(makeRequest('PUT', { Authorization: AUTH }, body))).status).toBe(200);
    expect((await PATCH(makeRequest('PATCH', { Authorization: AUTH }, body))).status).toBe(200);
  });

  it('rejects a missing Authorization header', async () => {
    expect((await POST(makeRequest('POST'))).status).toBe(401);
  });

  it('rejects a wrong token', async () => {
    expect((await POST(makeRequest('POST', { Authorization: 'Bearer wrong-token' }))).status).toBe(401);
  });

  it('rejects the token without the "Bearer " prefix', async () => {
    const res = await POST(makeRequest('POST', { Authorization: AUTH.replace('Bearer ', '') }));
    expect(res.status).toBe(401);
  });

  it('rejects bad credentials on PUT and PATCH too', async () => {
    expect((await PUT(makeRequest('PUT', { Authorization: 'Bearer nope' }))).status).toBe(401);
    expect((await PATCH(makeRequest('PATCH'))).status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await POST(makeRequest('POST', { Authorization: AUTH }, JSON.stringify(triggered), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('accepts an empty body', async () => {
    const res = await POST(makeRequest('POST', { Authorization: AUTH }, ''));
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await POST(makeRequest('POST', { Authorization: AUTH }, 'not json'))).status).toBe(400);
  });

  it('accepts a payload with no recognised event', async () => {
    const res = await POST(makeRequest('POST', { Authorization: AUTH }, JSON.stringify({ foo: 'bar' })));
    expect(res.status).toBe(200);
  });
});

describe('helpers', () => {
  it('never accepts when NEXTHINK_AUTHORIZATION is unset', () => {
    expect(verifyNexthinkRequest(new Headers({ Authorization: 'Bearer x' }), {})).toBe(false);
    expect(
      verifyNexthinkRequest(new Headers({ Authorization: '' }), { NEXTHINK_AUTHORIZATION: '' })
    ).toBe(false);
  });
});
