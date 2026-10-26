import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/jobadder/route';
import { verifyJobAdderRequest } from '../lib/verify-jobadder';

const AUTH = 'Basic dXNlcm5hbWU6cGFzc3dvcmQ=';

beforeAll(() => {
  process.env.JOBADDER_AUTHORIZATION = AUTH;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

// Envelope from JobAdder's documented notification message
function envelope(event: string) {
  return {
    apiVersion: 2,
    event,
    eventId: '00000000-0000-0000-0000-000000000000',
    eventDate: '2019-01-01T09:00:00Z',
    eventUser: {},
    eventData: {},
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(envelope('placement_approved')),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/jobadder', {
    method: 'POST',
    headers: { 'Content-Type': contentType, ...headers },
    body,
  });
}

describe('JobAdder webhook route', () => {
  it('accepts the full Authorization header value', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('rejects a missing Authorization header', async () => {
    expect((await POST(makeRequest())).status).toBe(401);
  });

  it('rejects a wrong credential', async () => {
    const res = await POST(makeRequest({ Authorization: 'Basic d3Jvbmc6d3Jvbmc=' }));
    expect(res.status).toBe(401);
  });

  it('rejects the credential without its scheme prefix', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH.replace('Basic ', '') }));
    expect(res.status).toBe(401);
  });

  it('rejects the decoded username:password', async () => {
    const decoded = Buffer.from(AUTH.replace('Basic ', ''), 'base64').toString('utf8');
    expect((await POST(makeRequest({ Authorization: decoded }))).status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await POST(
      makeRequest({ Authorization: AUTH }, JSON.stringify(envelope('job_status_changed')), 'text/plain')
    );
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await POST(makeRequest({ Authorization: AUTH }, 'not json'))).status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    expect((await POST(makeRequest({ Authorization: AUTH }, '[1,2]'))).status).toBe(400);
  });

  it.each([
    'candidate_status_changed',
    'job_status_changed',
    'jobapplication_status_changed',
    'placement_approved',
    'interview_scheduled',
  ])('accepts %s', async (event) => {
    const res = await POST(makeRequest({ Authorization: AUTH }, JSON.stringify(envelope(event))));
    expect(res.status).toBe(200);
  });
});

describe('helpers', () => {
  it('never accepts when JOBADDER_AUTHORIZATION is unset', () => {
    expect(verifyJobAdderRequest(new Headers({ Authorization: 'Basic x' }), {})).toBe(false);
    expect(
      verifyJobAdderRequest(new Headers({ Authorization: '' }), { JOBADDER_AUTHORIZATION: '' })
    ).toBe(false);
  });
});
