import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/8x8/route';
import { verify8x8Request } from '../lib/verify-8x8';

const AUTH = 'Bearer 9QQhlsEb8VY';

beforeAll(() => {
  process.env.EIGHT_X_EIGHT_AUTHORIZATION = AUTH;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  process.env.EIGHT_X_EIGHT_AUTHORIZATION = AUTH;
});

// Shapes taken from the 8x8 docs' sample payloads (trimmed)
const inbound = {
  namespace: 'SMS',
  eventType: 'inbound_message_received',
  description: 'SMS inbound message',
  payload: { umid: '9e09ac86-bd74-5465-851d-1eb5a5fdbb9a', source: '+6581968289', destination: '+4534735477', body: 'Test MO message' },
};
const receipt = {
  namespace: 'SMS',
  eventType: 'outbound_message_status_changed',
  description: 'SMS outbound message delivery receipt',
  payload: { umid: '9e09ac86-bd74-5465-851d-1eb5a5fdbb9a', status: { state: 'delivered', timestamp: '2016-01-01T00:00:00Z' } },
};
const click = {
  namespace: 'SMS',
  eventType: 'short_url_clicked',
  description: 'Short URL from SMS clicked',
  payload: { eventId: '0f6a0c0f-8b67-4a3a-a6c3-7b0ecf0d2b1a', shortUrl: 'https://2g.to/abc123/abc', targetUrl: 'https://example.com/landing' },
};
const template = {
  eventId: 'e1',
  provider: 'WhatsApp',
  eventType: 'template_status_update',
  eventDetails: { templateName: 'welcome', meta: { status: 'APPROVED' } },
};

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(inbound),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/8x8', {
    method: 'POST',
    headers: { 'Content-Type': contentType, ...headers },
    body,
  });
}

describe('8x8 webhook route', () => {
  it('accepts the full Authorization header value', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('rejects a missing Authorization header', async () => {
    expect((await POST(makeRequest())).status).toBe(401);
  });

  it('rejects a wrong credential', async () => {
    expect((await POST(makeRequest({ Authorization: 'Bearer wrong-token' }))).status).toBe(401);
  });

  it('rejects the credential without the Bearer prefix', async () => {
    expect((await POST(makeRequest({ Authorization: '9QQhlsEb8VY' }))).status).toBe(401);
  });

  it('compares a Basic value as a whole string without decoding it', async () => {
    const basic = 'Basic dXNlcjpwYXNzd29yZA==';
    process.env.EIGHT_X_EIGHT_AUTHORIZATION = basic;
    expect((await POST(makeRequest({ Authorization: basic }))).status).toBe(200);
    expect((await POST(makeRequest({ Authorization: 'Basic dXNlcjpwYXNzd29yZB==' }))).status).toBe(401);
    expect((await POST(makeRequest({ Authorization: 'user:password' }))).status).toBe(401);
    expect((await POST(makeRequest({ Authorization: 'dXNlcjpwYXNzd29yZA==' }))).status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH }, JSON.stringify(receipt), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await POST(makeRequest({ Authorization: AUTH }, 'not json'))).status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    expect((await POST(makeRequest({ Authorization: AUTH }, '[1,2]'))).status).toBe(400);
  });

  it('accepts every documented event shape', async () => {
    for (const body of [inbound, receipt, click, template]) {
      expect((await POST(makeRequest({ Authorization: AUTH }, JSON.stringify(body)))).status).toBe(200);
    }
  });
});

describe('verify8x8Request', () => {
  it('never accepts when EIGHT_X_EIGHT_AUTHORIZATION is unset', () => {
    expect(verify8x8Request(new Headers({ Authorization: 'Bearer x' }), {})).toBe(false);
    expect(verify8x8Request(new Headers({ Authorization: '' }), { EIGHT_X_EIGHT_AUTHORIZATION: '' })).toBe(false);
  });
});
