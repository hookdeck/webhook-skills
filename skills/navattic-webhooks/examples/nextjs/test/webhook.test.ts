import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE, GET, PATCH, POST, PUT } from '../app/webhooks/navattic/route';
import { classifyData, verifyNavatticRequest } from '../lib/verify-navattic';

const CREDENTIAL = 'Bearer 1b2c3d4e5f6047189a0bc1d2e3f40516';

beforeAll(() => {
  process.env.NAVATTIC_AUTHORIZATION = CREDENTIAL;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

// Shapes taken from Navattic's documented session_closed examples (trimmed)
const companyAccount = {
  id: 'clx8f4iii0011abcd12345678',
  createdAt: '2026-06-01T09:14:00.000Z',
  updatedAt: '2026-07-14T18:32:05.000Z',
  workspaceId: 'clx8ezzzz0000abcd12345678',
  name: 'Example Corp',
  websiteDomain: 'example.com',
  engaged: true,
  employeeCount: 250,
  customPropertyValues: [],
};
const visitor = {
  eventType: 'session_closed',
  timestamp: '2026-07-14T18:32:05.000Z',
  data: {
    session: {
      type: 'INTERACTIVE_DEMO',
      recordedGuideSessionId: 'clx8f2k1a0003abcd12345678',
      createdAt: '2026-07-14T18:20:11.000Z',
      closedAt: '2026-07-14T18:32:05.000Z',
      mostRecentDemoName: 'Acme Product Tour',
      recordedEvents: [{ id: 'clx8f3xyz0004abcd12345678', type: 'VIEW_STEP', recordedStepName: 'Welcome' }],
    },
    endUser: { id: 'clx8f1hhh0010abcd12345678', mostRecentEmail: 'jane.doe@example.com', mostRecentName: 'Jane Doe' },
    companyAccount,
  },
};
const account = {
  eventType: 'session_closed',
  timestamp: '2026-07-14T18:32:05.000Z',
  data: companyAccount,
};

function makeRequest(
  method: string,
  headers: Record<string, string> = {},
  body: string | undefined = JSON.stringify(visitor),
  contentType = 'application/json'
): NextRequest {
  const hasBody = body !== undefined && method !== 'GET';
  return new NextRequest('http://localhost:3000/webhooks/navattic', {
    method,
    headers: hasBody ? { 'Content-Type': contentType, ...headers } : headers,
    body: hasBody ? body : undefined,
  });
}

const auth = { Authorization: CREDENTIAL };

describe('Navattic webhook', () => {
  it('accepts the full Authorization header value (Bearer)', async () => {
    const res = await POST(makeRequest('POST', auth));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('compares a Basic credential as a whole string, without decoding it', async () => {
    const basic = `Basic ${Buffer.from('user:pa:ss').toString('base64')}`;
    process.env.NAVATTIC_AUTHORIZATION = basic;
    try {
      expect((await POST(makeRequest('POST', { Authorization: basic }))).status).toBe(200);
      expect((await POST(makeRequest('POST', auth))).status).toBe(401);
    } finally {
      process.env.NAVATTIC_AUTHORIZATION = CREDENTIAL;
    }
  });

  it('rejects a missing Authorization header', async () => {
    expect((await POST(makeRequest('POST'))).status).toBe(401);
  });

  it('rejects a wrong credential', async () => {
    expect((await POST(makeRequest('POST', { Authorization: 'Bearer wrong' }))).status).toBe(401);
  });

  it('rejects the token without the "Bearer " prefix', async () => {
    const res = await POST(makeRequest('POST', { Authorization: CREDENTIAL.replace('Bearer ', '') }));
    expect(res.status).toBe(401);
  });

  it.each([
    ['GET', GET],
    ['POST', POST],
    ['PUT', PUT],
    ['PATCH', PATCH],
    ['DELETE', DELETE],
  ])('checks the credential first for %s', async (method, handler) => {
    expect((await handler(makeRequest(method))).status).toBe(401);
    expect((await handler(makeRequest(method, auth))).status).toBe(200);
  });

  it('accepts an authenticated request with an empty body', async () => {
    const res = await GET(makeRequest('GET', auth, undefined));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('authenticates regardless of content type', async () => {
    const res = await POST(makeRequest('POST', auth, JSON.stringify(visitor), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('handles account events', async () => {
    const res = await POST(makeRequest('POST', auth, JSON.stringify(account)));
    expect(res.status).toBe(200);
  });

  it('acknowledges unknown event types', async () => {
    const res = await POST(makeRequest('POST', auth, JSON.stringify({ ...visitor, eventType: 'something_else' })));
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await POST(makeRequest('POST', auth, 'not json'))).status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    expect((await POST(makeRequest('POST', auth, '[1,2]'))).status).toBe(400);
  });

  it('classifies visitor and account data', () => {
    expect(classifyData(visitor.data)).toBe('visitor');
    expect(classifyData(account.data)).toBe('account');
    expect(classifyData({ foo: 1 })).toBeNull();
    expect(classifyData(null)).toBeNull();
  });

  it('never accepts when NAVATTIC_AUTHORIZATION is unset', () => {
    expect(verifyNavatticRequest(new Headers({ authorization: 'Bearer x' }), {})).toBe(false);
    expect(verifyNavatticRequest(new Headers({ authorization: '' }), { NAVATTIC_AUTHORIZATION: '' })).toBe(false);
  });
});
