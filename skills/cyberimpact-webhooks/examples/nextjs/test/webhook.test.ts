import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/cyberimpact/route';
import { verifyCyberimpactRequest } from '../lib/verify-cyberimpact';

const HEADER = 'Authorization';
const SECRET = 'Bearer test_cyberimpact_secret_0123456789';

beforeAll(() => {
  process.env.CYBERIMPACT_WEBHOOK_HEADER = HEADER;
  process.env.CYBERIMPACT_WEBHOOK_SECRET = SECRET;
});

function samplePayload(event = 'automation.webhook.send') {
  return {
    id: 'test_evt_GppedVq2CWTWxUUxrm26bic0C',
    event,
    timestamp: '2024-05-28T12:56:40Z',
    idClient: 3,
    data: { type: 'member', id: 54321, email: 'john.doe@example.org', firstname: 'John', lastname: 'Doe' },
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/cyberimpact', {
    method: 'POST',
    headers: { 'Content-Type': contentType, ...headers },
    body,
  });
}

describe('credential verification', () => {
  it('accepts the exact whole header value (including Bearer prefix)', async () => {
    const res = await POST(makeRequest({ [HEADER]: SECRET }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('matches the header name case-insensitively', async () => {
    const res = await POST(makeRequest({ authorization: SECRET }));
    expect(res.status).toBe(200);
  });

  it('does not strip a Bearer prefix', async () => {
    const res = await POST(makeRequest({ [HEADER]: SECRET.replace('Bearer ', '') }));
    expect(res.status).toBe(401);
  });

  it('rejects a wrong value of the same length', async () => {
    const res = await POST(makeRequest({ [HEADER]: 'x'.repeat(SECRET.length) }));
    expect(res.status).toBe(401);
  });

  it('rejects a wrong value of a different length', async () => {
    const res = await POST(makeRequest({ [HEADER]: 'short' }));
    expect(res.status).toBe(401);
  });

  it('rejects a missing header', async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it('reads a custom header name', () => {
    const opts = { name: 'XSecret', secret: 's3cret' };
    expect(verifyCyberimpactRequest(new Headers({ XSecret: 's3cret' }), opts)).toBe(true);
    expect(verifyCyberimpactRequest(new Headers({ Authorization: 's3cret' }), opts)).toBe(false);
  });

  it('rejects everything when no secret is configured', () => {
    expect(verifyCyberimpactRequest(new Headers({ Authorization: SECRET }), { secret: '' })).toBe(false);
  });
});

describe('body handling', () => {
  it('accepts any content type', async () => {
    const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload()), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await POST(makeRequest({ [HEADER]: SECRET }, '{not json'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a non-object body', async () => {
    const res = await POST(makeRequest({ [HEADER]: SECRET }, '[1,2]'));
    expect(res.status).toBe(400);
  });

  it('checks the credential before parsing the body', async () => {
    const res = await POST(makeRequest({}, '{not json'));
    expect(res.status).toBe(401);
  });
});

describe('event handling', () => {
  it('handles automation.webhook.send', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await POST(makeRequest({ [HEADER]: SECRET }));
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('54321'));
    expect(spy).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled'));
    spy.mockRestore();
  });

  it('acknowledges unknown events', async () => {
    const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload('something.new'))));
    expect(res.status).toBe(200);
  });
});
