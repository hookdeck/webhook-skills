import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/knowbe4/route';
import { verifyKnowbe4Request } from '../lib/verify-knowbe4';

const SECRET = 'Bearer 7f3c9a1e5b2d4086a9c1e3f5071b2d4c';

beforeAll(() => {
  process.env.KNOWBE4_WEBHOOK_SECRET = SECRET;
  delete process.env.KNOWBE4_WEBHOOK_HEADER; // default: Authorization
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

// ILLUSTRATIVE payload: KnowBe4 documents no body schema or event field.
const payload = { event_type: 'Phish Failure Removed', System: 'KnowBe4' };

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(payload),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/knowbe4', {
    method: 'POST',
    headers: { 'Content-Type': contentType, ...headers },
    body,
  });
}

describe('KnowBe4 webhook', () => {
  it('accepts the whole Authorization value, Bearer prefix included', async () => {
    const res = await POST(makeRequest({ Authorization: SECRET }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('looks the header up case-insensitively', async () => {
    const res = await POST(makeRequest({ authorization: SECRET }));
    expect(res.status).toBe(200);
  });

  it('rejects a missing header', async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it('rejects a wrong secret', async () => {
    const res = await POST(makeRequest({ Authorization: 'Bearer wrong' }));
    expect(res.status).toBe(401);
  });

  it('does not strip the Bearer prefix', async () => {
    const res = await POST(makeRequest({ Authorization: SECRET.replace('Bearer ', '') }));
    expect(res.status).toBe(401);
  });

  it('authenticates before parsing: bad JSON without the header is 401, not 400', async () => {
    const res = await POST(makeRequest({}, 'not json'));
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid JSON once authenticated', async () => {
    const res = await POST(makeRequest({ Authorization: SECRET }, 'not json'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a JSON array body', async () => {
    const res = await POST(makeRequest({ Authorization: SECRET }, '[1,2]'));
    expect(res.status).toBe(400);
  });

  it('accepts any content type', async () => {
    const res = await POST(makeRequest({ Authorization: SECRET }, JSON.stringify(payload), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('handles a payload with no event_type', async () => {
    const res = await POST(makeRequest({ Authorization: SECRET }, JSON.stringify({ System: 'PhishER' })));
    expect(res.status).toBe(200);
  });
});

describe('verifyKnowbe4Request', () => {
  it('reads the header name from config', () => {
    const config = { KNOWBE4_WEBHOOK_HEADER: 'X-KnowBe4-Key', KNOWBE4_WEBHOOK_SECRET: 'abc123' };
    expect(verifyKnowbe4Request(new Headers({ 'x-knowbe4-key': 'abc123' }), config)).toBe(true);
    expect(verifyKnowbe4Request(new Headers({ authorization: 'abc123' }), config)).toBe(false);
  });

  it('fails closed when the secret is unset', () => {
    expect(verifyKnowbe4Request(new Headers({ authorization: 'undefined' }), {})).toBe(false);
  });

  it('rejects a longer value that starts with the secret', () => {
    const config = { KNOWBE4_WEBHOOK_SECRET: 'abc123' };
    expect(verifyKnowbe4Request(new Headers({ authorization: 'abc123x' }), config)).toBe(false);
  });
});
