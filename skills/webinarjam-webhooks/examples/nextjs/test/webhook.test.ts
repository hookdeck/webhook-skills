import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/webinarjam/route';
import { verifyWebinarJamRequest } from '../lib/verify-webinarjam';

const SECRET = 'Bearer wj_test_3f9a1c7e5b2d4086';

beforeAll(() => {
  process.env.WEBINARJAM_WEBHOOK_SECRET = SECRET;
  delete process.env.WEBINARJAM_WEBHOOK_HEADER; // default: Authorization
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  process.env.WEBINARJAM_WEBHOOK_SECRET = SECRET;
});

// Illustrative payload: WebinarJam does not document field names.
const lead = {
  event: 'registered',
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@example.com',
  phone: '+15555550100',
  live_room_link: 'https://example.com/live',
  replay_link: 'https://example.com/replay',
  unsubscribe_link: 'https://example.com/unsubscribe',
};

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(lead),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/webinarjam', {
    method: 'POST',
    headers: { 'Content-Type': contentType, ...headers },
    body,
  });
}

describe('WebinarJam webhook route', () => {
  it('accepts the whole Authorization header value', async () => {
    const res = await POST(makeRequest({ Authorization: SECRET }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('rejects a missing header', async () => {
    expect((await POST(makeRequest())).status).toBe(401);
  });

  it('rejects a wrong token', async () => {
    expect((await POST(makeRequest({ Authorization: 'Bearer nope' }))).status).toBe(401);
  });

  it('rejects the token without the "Bearer " prefix (whole value is compared)', async () => {
    const res = await POST(makeRequest({ Authorization: SECRET.replace('Bearer ', '') }));
    expect(res.status).toBe(401);
  });

  it('rejects a longer value without throwing', async () => {
    expect((await POST(makeRequest({ Authorization: SECRET + 'x' }))).status).toBe(401);
  });

  it('accepts any content type', async () => {
    const res = await POST(makeRequest({ Authorization: SECRET }, JSON.stringify(lead), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON once authenticated', async () => {
    expect((await POST(makeRequest({ Authorization: SECRET }, 'not json'))).status).toBe(400);
  });

  it('returns 400 for a non-object body', async () => {
    expect((await POST(makeRequest({ Authorization: SECRET }, '[1]'))).status).toBe(400);
  });

  it.each(['registered', 'attended_live', 'missed_live', 'left_early', 'purchased', 'other'])(
    'handles the %s trigger',
    async (event) => {
      const res = await POST(makeRequest({ Authorization: SECRET }, JSON.stringify({ ...lead, event })));
      expect(res.status).toBe(200);
    }
  );

  it('returns 500 when no secret is configured', async () => {
    delete process.env.WEBINARJAM_WEBHOOK_SECRET;
    expect((await POST(makeRequest({ Authorization: SECRET }))).status).toBe(500);
  });
});

describe('verifyWebinarJamRequest', () => {
  it('reads a custom header name, case-insensitively', () => {
    const config = { WEBINARJAM_WEBHOOK_HEADER: 'X-Webinar-Key', WEBINARJAM_WEBHOOK_SECRET: 'abc123' };
    expect(verifyWebinarJamRequest(new Headers({ 'x-webinar-key': 'abc123' }), config)).toBe(true);
    expect(verifyWebinarJamRequest(new Headers({ 'x-webinar-key': 'abc124' }), config)).toBe(false);
    expect(verifyWebinarJamRequest(new Headers({ authorization: 'abc123' }), config)).toBe(false);
  });

  it('never matches when the secret is unset', () => {
    expect(verifyWebinarJamRequest(new Headers({ authorization: '' }), {})).toBe(false);
    expect(verifyWebinarJamRequest(new Headers(), { WEBINARJAM_WEBHOOK_SECRET: '' })).toBe(false);
  });
});
