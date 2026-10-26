import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/procore/route';
import { verifyProcoreRequest } from '../lib/verify-procore';

// Format from the Procore docs: a token, not base64 user:pass. Never decoded.
const AUTH = 'Basic c3a24b8208ac5199d083d54a1234e94b8864';

beforeAll(() => {
  process.env.PROCORE_AUTHORIZATION = AUTH;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

// Illustrative v2 payload; field names are not confirmed against the developer docs
const payload = (eventType: string) => ({
  id: 'evt_1',
  ulid: '01H8XYZ0000000000000000000',
  timestamp: '2026-10-25T12:00:00Z',
  user_id: 42,
  company_id: 1001,
  project_id: 2002,
  api_version: 'v2',
  event_type: eventType,
  resource_name: 'RFIs',
  resource_id: 3003,
});

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(payload('create')),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/procore', {
    method: 'POST',
    headers: { 'Content-Type': contentType, ...headers },
    body,
  });
}

describe('Procore webhook route', () => {
  it('accepts the full Authorization header value', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('rejects a missing Authorization header', async () => {
    expect((await POST(makeRequest())).status).toBe(401);
  });

  it('rejects a wrong credential', async () => {
    expect((await POST(makeRequest({ Authorization: 'Basic 0000' }))).status).toBe(401);
  });

  it('rejects the token without the scheme prefix (no stripping)', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH.replace('Basic ', '') }));
    expect(res.status).toBe(401);
  });

  it('rejects a different scheme prefix', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH.replace('Basic', 'Bearer') }));
    expect(res.status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH }, JSON.stringify(payload('update')), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('handles create, update and delete', async () => {
    for (const type of ['create', 'update', 'delete']) {
      const res = await POST(makeRequest({ Authorization: AUTH }, JSON.stringify(payload(type))));
      expect(res.status).toBe(200);
    }
  });

  it('returns 200 for an unknown event_type', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH }, JSON.stringify(payload('other'))));
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
  it('never accepts when PROCORE_AUTHORIZATION is unset', () => {
    expect(verifyProcoreRequest(new Headers({ Authorization: 'x' }), {})).toBe(false);
    expect(verifyProcoreRequest(new Headers({ Authorization: '' }), { PROCORE_AUTHORIZATION: '' })).toBe(false);
  });
});
