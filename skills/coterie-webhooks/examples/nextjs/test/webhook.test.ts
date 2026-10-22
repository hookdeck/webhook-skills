import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/coterie/route';
import { classify, verifyCoterieRequest } from '../lib/verify-coterie';

const TOKEN = 'token 1b2c3d4e-5f60-4718-9a0b-c1d2e3f40516';

beforeAll(() => {
  process.env.COTERIE_AUTHENTICATION = TOKEN;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

// Shapes taken from Coterie's documented sample payloads (trimmed)
const application = {
  applicationId: '83857350-4bfb-4669-862c-61f05a7a4be9',
  Status: 'ReadyToQuote',
  BusinessName: 'Test The link',
};
const quote = {
  quoteId: '323d6e60-cb75-4098-af71-a643d8f47dba',
  PolicyType: 'BOP',
  Premium: 2699,
  applicationId: '83857350-4bfb-4669-862c-61f05a7a4be9',
};
const policy = {
  PolicyId: 'b6a4f634-a78f-40a2-bede-8bd352435d19',
  PolicyNumber: 'CSANDSB-00080305-00',
  Status: 'Pending',
};

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(application),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/coterie', {
    method: 'POST',
    headers: { 'Content-Type': contentType, ...headers },
    body,
  });
}

describe('Coterie webhook route', () => {
  it('accepts the full Authentication header value', async () => {
    const res = await POST(makeRequest({ Authentication: TOKEN }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('rejects a missing Authentication header', async () => {
    expect((await POST(makeRequest())).status).toBe(401);
  });

  it('rejects a wrong token', async () => {
    const res = await POST(makeRequest({ Authentication: 'token 00000000-0000-0000-0000-000000000000' }));
    expect(res.status).toBe(401);
  });

  it('rejects the guid without the "token " prefix', async () => {
    const res = await POST(makeRequest({ Authentication: TOKEN.replace('token ', '') }));
    expect(res.status).toBe(401);
  });

  it('does not accept the Authorization header', async () => {
    expect((await POST(makeRequest({ Authorization: TOKEN }))).status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await POST(makeRequest({ Authentication: TOKEN }, JSON.stringify(policy), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await POST(makeRequest({ Authentication: TOKEN }, 'not json'))).status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    expect((await POST(makeRequest({ Authentication: TOKEN }, '[1,2]'))).status).toBe(400);
  });

  it('accepts quote and policy payloads', async () => {
    expect((await POST(makeRequest({ Authentication: TOKEN }, JSON.stringify(quote)))).status).toBe(200);
    expect((await POST(makeRequest({ Authentication: TOKEN }, JSON.stringify(policy)))).status).toBe(200);
  });
});

describe('helpers', () => {
  it('classifies payloads by identifier key', () => {
    expect(classify(application)).toBe('application');
    expect(classify(quote)).toBe('quote');
    expect(classify(policy)).toBe('policy');
    expect(classify({ foo: 1 })).toBeNull();
  });

  it('never accepts when COTERIE_AUTHENTICATION is unset', () => {
    const headers = new Headers({ Authentication: 'token x' });
    expect(verifyCoterieRequest(headers, {})).toBe(false);
    expect(verifyCoterieRequest(new Headers({ Authentication: '' }), { COTERIE_AUTHENTICATION: '' })).toBe(false);
  });
});
