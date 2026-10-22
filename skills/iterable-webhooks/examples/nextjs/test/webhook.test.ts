import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/iterable/route';
import { verifyIterableRequest } from '../lib/verify-iterable';

const AUTH = 'Bearer 1b2c3d4e-5f60-4718-9a0b-c1d2e3f40516';

beforeAll(() => {
  process.env.ITERABLE_AUTHORIZATION = AUTH;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

// Shapes taken from Iterable's documented example payloads (trimmed)
const emailSend = {
  email: 'user@example.com',
  eventName: 'emailSend',
  dataFields: { campaignId: 59667, messageId: '9c438a20d26e4e9f8ad4edea23f811cd', emailSubject: 'My subject' },
};
const emailOpen = { email: 'user@example.com', eventName: 'emailOpen', dataFields: { campaignId: 49313, isBot: false } };
const emailBounce = { email: 'user@example.com', eventName: 'emailBounce', dataFields: { recipientState: 'HardBounce' } };
const emailUnSubscribe = { email: 'user@example.com', eventName: 'emailUnSubscribe', dataFields: { unsubSource: 'EmailLink' } };

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(emailSend),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/iterable', {
    method: 'POST',
    headers: { 'Content-Type': contentType, ...headers },
    body,
  });
}

describe('Iterable webhook route', () => {
  it('accepts the full Bearer Authorization value (OAuth 2.0)', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('compares a Basic value as-is, never decoded', () => {
    const config = { ITERABLE_AUTHORIZATION: 'Basic abc123' };
    expect(verifyIterableRequest(new Headers({ Authorization: 'Basic abc123' }), config)).toBe(true);
    expect(verifyIterableRequest(new Headers({ Authorization: 'Basic YWJjMTIz' }), config)).toBe(false);
  });

  it('rejects a missing Authorization header', async () => {
    expect((await POST(makeRequest())).status).toBe(401);
  });

  it('rejects a wrong credential', async () => {
    const res = await POST(makeRequest({ Authorization: 'Bearer 00000000-0000-0000-0000-000000000000' }));
    expect(res.status).toBe(401);
  });

  it('rejects the token without the Bearer prefix', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH.replace('Bearer ', '') }));
    expect(res.status).toBe(401);
  });

  it('rejects before parsing: bad credential with invalid JSON is 401, not 400', async () => {
    expect((await POST(makeRequest({}, 'not json'))).status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH }, JSON.stringify(emailOpen), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await POST(makeRequest({ Authorization: AUTH }, 'not json'))).status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    expect((await POST(makeRequest({ Authorization: AUTH }, '[1,2]'))).status).toBe(400);
  });

  it('accepts documented event names, including unknown ones', async () => {
    for (const body of [emailOpen, emailBounce, emailUnSubscribe, { eventName: 'journeyExit', email: 'a@b.co' }]) {
      expect((await POST(makeRequest({ Authorization: AUTH }, JSON.stringify(body)))).status).toBe(200);
    }
  });
});

describe('verifyIterableRequest', () => {
  it('never accepts when ITERABLE_AUTHORIZATION is unset', () => {
    expect(verifyIterableRequest(new Headers({ Authorization: 'Bearer x' }), {})).toBe(false);
    expect(
      verifyIterableRequest(new Headers({ Authorization: '' }), { ITERABLE_AUTHORIZATION: '' })
    ).toBe(false);
  });
});
