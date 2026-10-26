import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/ukg-ready/route';
import { verifyUkgReadyRequest } from '../lib/verify-ukg-ready';

const AUTH = 'Bearer 7f3c9a1e5b2d4c68a0e1f2d3c4b5a697';

beforeAll(() => {
  process.env.UKG_READY_AUTHORIZATION = AUTH;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

// ILLUSTRATIVE payload: UKG Ready shows the real shape only in the app, per subscription
// (the fields you tick). These field names are made up for the test.
const accountCreated = { accountId: 1001, firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' };
const accountUpdated = { accountId: 1001, email: 'ada.lovelace@example.com', phone: '555-0100' };

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(accountCreated),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/ukg-ready', {
    method: 'POST',
    headers: { 'Content-Type': contentType, ...headers },
    body,
  });
}

describe('UKG Ready webhook route', () => {
  it('accepts the full Authorization header value (ACCOUNT_CREATED)', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts an ACCOUNT_UPDATED style payload', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH }, JSON.stringify(accountUpdated)));
    expect(res.status).toBe(200);
  });

  it('rejects a missing Authorization header', async () => {
    expect((await POST(makeRequest())).status).toBe(401);
  });

  it('rejects a wrong token', async () => {
    expect((await POST(makeRequest({ Authorization: 'Bearer wrong-token' }))).status).toBe(401);
  });

  it('rejects the token without the "Bearer " prefix', async () => {
    expect((await POST(makeRequest({ Authorization: AUTH.replace('Bearer ', '') }))).status).toBe(401);
  });

  it('rejects Basic credentials', async () => {
    const basic = 'Basic ' + Buffer.from('user:pass').toString('base64');
    expect((await POST(makeRequest({ Authorization: basic }))).status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH }, JSON.stringify(accountCreated), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await POST(makeRequest({ Authorization: AUTH }, 'not json'))).status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    expect((await POST(makeRequest({ Authorization: AUTH }, '[1,2]'))).status).toBe(400);
  });
});

describe('helpers', () => {
  it('never accepts when UKG_READY_AUTHORIZATION is unset', () => {
    expect(verifyUkgReadyRequest(new Headers({ Authorization: 'Bearer x' }), {})).toBe(false);
    expect(
      verifyUkgReadyRequest(new Headers({ Authorization: '' }), { UKG_READY_AUTHORIZATION: '' })
    ).toBe(false);
  });
});
