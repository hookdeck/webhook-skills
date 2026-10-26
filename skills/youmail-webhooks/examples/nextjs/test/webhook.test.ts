import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/youmail/route';
import { classify, verifyYouMailRequest } from '../lib/verify-youmail';

const AUTH = 'Bearer 1b2c3d4e-5f60-4718-9a0b-c1d2e3f40516';

beforeAll(() => {
  process.env.YOUMAIL_AUTHORIZATION = AUTH;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

// Shapes taken from the payload schemas in YouMail's OpenAPI spec (trimmed)
const callEvents = { callEvents: [{ callEventUuid: 'a1b2c3', callResult: 'BLOCKED' }] };
const phoneInsights = { callVolumeSummaries: [{ callingPhoneNumber: '+15555550100', destinationCarriers: [] }] };
const tnReport = {
  tnReportUuid: 'f0e1d2',
  phoneNumber: '+15555550100',
  status: 'MITIGATED',
  statusChangeTime: 1760000000000,
};
const scoreThreshold = {
  phoneNumber: '+15555550100',
  oldSpamScore: 0.4,
  newSpamScore: 0.9,
  createdDate: '2026-10-25T12:00:00Z',
};

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(callEvents),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/youmail', {
    method: 'POST',
    headers: { 'Content-Type': contentType, ...headers },
    body,
  });
}

describe('YouMail webhook route', () => {
  it('accepts the full Authorization header value', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('rejects a missing Authorization header', async () => {
    expect((await POST(makeRequest())).status).toBe(401);
  });

  it('rejects a wrong token', async () => {
    const res = await POST(makeRequest({ Authorization: 'Bearer 00000000-0000-0000-0000-000000000000' }));
    expect(res.status).toBe(401);
  });

  it('rejects the token without the "Bearer " prefix', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH.replace('Bearer ', '') }));
    expect(res.status).toBe(401);
  });

  it('rejects a Basic credential', async () => {
    expect((await POST(makeRequest({ Authorization: 'Basic dXNlcjpwYXNz' }))).status).toBe(401);
  });

  it('rejects a value of a different length without throwing', async () => {
    expect((await POST(makeRequest({ Authorization: 'Bearer x' }))).status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH }, JSON.stringify(tnReport), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await POST(makeRequest({ Authorization: AUTH }, 'not json'))).status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    expect((await POST(makeRequest({ Authorization: AUTH }, '[1,2]'))).status).toBe(400);
  });

  it('accepts every documented payload shape', async () => {
    for (const body of [callEvents, phoneInsights, tnReport, scoreThreshold]) {
      expect((await POST(makeRequest({ Authorization: AUTH }, JSON.stringify(body)))).status).toBe(200);
    }
  });
});

describe('helpers', () => {
  it('classifies payloads by top-level keys', () => {
    expect(classify(callEvents)).toBe('CALL_EVENT');
    expect(classify(phoneInsights)).toBe('PHONE_INSIGHTS');
    expect(classify(tnReport)).toBe('PROVIDER_TN_REPORT_STATUS');
    expect(classify(scoreThreshold)).toBe('WATCHLIST_SCORE_THRESHOLD');
    expect(classify({ foo: 1 })).toBeNull();
  });

  it('never accepts when YOUMAIL_AUTHORIZATION is unset', () => {
    expect(verifyYouMailRequest(new Headers({ Authorization: 'Bearer x' }), {})).toBe(false);
    expect(verifyYouMailRequest(new Headers({ Authorization: '' }), { YOUMAIL_AUTHORIZATION: '' })).toBe(false);
  });
});
