import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/lessonly/route';
import { verifyLessonlyRequest } from '../lib/verify-lessonly';

const AUTH = 'Bearer 1b2c3d4e-5f60-4718-9a0b-c1d2e3f40516';

beforeAll(() => {
  process.env.LESSONLY_AUTHORIZATION = AUTH;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

// ILLUSTRATIVE lesson-completed body: Lessonly does not document the payload
const lessonCompleted = {
  lesson_id: 1234,
  user_id: 5678,
  completed_at: '2026-10-25T12:00:00Z',
};

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(lessonCompleted),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/lessonly', {
    method: 'POST',
    headers: { 'Content-Type': contentType, ...headers },
    body,
  });
}

describe('Lessonly webhook route', () => {
  it('accepts the full Authorization header value', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('rejects a missing Authorization header', async () => {
    expect((await POST(makeRequest())).status).toBe(401);
  });

  it('rejects a wrong credential', async () => {
    const res = await POST(makeRequest({ Authorization: 'Bearer 00000000-0000-0000-0000-000000000000' }));
    expect(res.status).toBe(401);
  });

  it('rejects the token without the "Bearer " prefix', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH.replace('Bearer ', '') }));
    expect(res.status).toBe(401);
  });

  it('does not strip or swap a scheme', async () => {
    const res = await POST(makeRequest({ Authorization: `Basic ${AUTH.replace('Bearer ', '')}` }));
    expect(res.status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH }, JSON.stringify(lessonCompleted), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 401 before parsing an invalid body without credentials', async () => {
    expect((await POST(makeRequest({}, 'not json'))).status).toBe(401);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await POST(makeRequest({ Authorization: AUTH }, 'not json'))).status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    expect((await POST(makeRequest({ Authorization: AUTH }, '[1,2]'))).status).toBe(400);
  });

  it('never accepts when LESSONLY_AUTHORIZATION is unset', () => {
    expect(verifyLessonlyRequest(new Headers({ authorization: 'Bearer x' }), {})).toBe(false);
    expect(
      verifyLessonlyRequest(new Headers({ authorization: 'Bearer x' }), { LESSONLY_AUTHORIZATION: '' })
    ).toBe(false);
  });

  it('handles non-ASCII values without throwing', () => {
    const config = { LESSONLY_AUTHORIZATION: 'Bearer é' };
    expect(verifyLessonlyRequest(new Headers({ authorization: 'Bearer e' }), config)).toBe(false);
  });
});
