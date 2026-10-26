import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/grist/route';
import { verifyGristRequest } from '../lib/verify-grist';

const CREDENTIAL = 'Bearer 1b2c3d4e-5f60-4718-9a0b-c1d2e3f40516';

beforeAll(() => {
  process.env.GRIST_AUTHORIZATION = CREDENTIAL;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

// Shape taken from Grist's documented sample payload (trimmed): a JSON array of rows
const rows = [
  { id: 29, manualSort: 29, Title: 'Trophy', Price: 60, Purchase_status: 'wishlisted' },
  { id: 24, manualSort: 24, Title: 'Dataman', Price: 50, Purchase_status: 'own digitally' },
];

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(rows),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/grist', {
    method: 'POST',
    headers: { 'Content-Type': contentType, ...headers },
    body,
  });
}

describe('Grist webhook route', () => {
  it('accepts the full Authorization header value', async () => {
    const res = await POST(makeRequest({ Authorization: CREDENTIAL }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, rows: 2 });
  });

  it('rejects a missing Authorization header', async () => {
    expect((await POST(makeRequest())).status).toBe(401);
  });

  it('rejects a wrong credential', async () => {
    const res = await POST(makeRequest({ Authorization: 'Bearer 00000000-0000-0000-0000-000000000000' }));
    expect(res.status).toBe(401);
  });

  it('rejects the token without the "Bearer " prefix', async () => {
    const res = await POST(makeRequest({ Authorization: CREDENTIAL.replace('Bearer ', '') }));
    expect(res.status).toBe(401);
  });

  it('does not strip or parse the scheme', async () => {
    const res = await POST(makeRequest({ Authorization: CREDENTIAL.replace('Bearer', 'Basic') }));
    expect(res.status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await POST(makeRequest({ Authorization: CREDENTIAL }, JSON.stringify(rows), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('accepts an empty array', async () => {
    expect((await POST(makeRequest({ Authorization: CREDENTIAL }, '[]'))).status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await POST(makeRequest({ Authorization: CREDENTIAL }, 'not json'))).status).toBe(400);
  });

  it('returns 400 for a JSON object instead of an array', async () => {
    expect((await POST(makeRequest({ Authorization: CREDENTIAL }, '{"id":1}'))).status).toBe(400);
  });

  it('returns 400 for an array of non-objects', async () => {
    expect((await POST(makeRequest({ Authorization: CREDENTIAL }, '[1,2]'))).status).toBe(400);
  });
});

describe('verifyGristRequest', () => {
  it('compares the whole header, including a Basic prefix', () => {
    const basic = 'Basic dXNlcjpwYXNz';
    expect(verifyGristRequest(new Headers({ Authorization: basic }), { GRIST_AUTHORIZATION: basic })).toBe(true);
  });

  it('never accepts when GRIST_AUTHORIZATION is unset', () => {
    expect(verifyGristRequest(new Headers({ Authorization: 'Bearer x' }), {})).toBe(false);
    expect(verifyGristRequest(new Headers({ Authorization: '' }), { GRIST_AUTHORIZATION: '' })).toBe(false);
  });
});
