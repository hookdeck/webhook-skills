import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/egnyte/route';
import { verifyEgnyteRequest } from '../lib/verify-egnyte';

const SECRET = 'Bearer secret-token-12345';

beforeAll(() => {
  process.env.EGNYTE_AUTHORIZATION = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

// Shape taken from Egnyte's documented webhook payload (trimmed)
const batch = {
  data: [
    {
      eventId: 'evt-1',
      domain: 'apidemo',
      timestamp: 1710000000000,
      user: { id: 1, displayName: 'John Doe', username: 'johndoe', email: 'john@example.com' },
      actionSource: 'WebUI',
      eventType: 'fs:add_file',
      webhookId: 'c9ac0519-284a-4bee-9574-30ae7891e5dc',
      data: { targetPath: '/Shared/Documents/a.txt', itemType: 'file' },
    },
    {
      eventId: 'evt-2',
      domain: 'apidemo',
      timestamp: 1710000001000,
      user: { id: 1, username: 'johndoe' },
      actionSource: 'API',
      eventType: 'link:create',
      webhookId: 'c9ac0519-284a-4bee-9574-30ae7891e5dc',
      data: {},
    },
  ],
};

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(batch),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/egnyte', {
    method: 'POST',
    headers: { 'Content-Type': contentType, ...headers },
    body,
  });
}

describe('Egnyte webhook route', () => {
  it('accepts the full Authorization header value with exactly 200', async () => {
    const res = await POST(makeRequest({ Authorization: SECRET }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('rejects a missing Authorization header', async () => {
    expect((await POST(makeRequest())).status).toBe(401);
  });

  it('rejects a wrong credential', async () => {
    const res = await POST(makeRequest({ Authorization: 'Bearer wrong-token-00000' }));
    expect(res.status).toBe(401);
  });

  it('rejects the credential without the "Bearer " prefix', async () => {
    const res = await POST(makeRequest({ Authorization: SECRET.replace('Bearer ', '') }));
    expect(res.status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await POST(makeRequest({ Authorization: SECRET }, JSON.stringify(batch), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('dispatches every event in data[]', async () => {
    await POST(makeRequest({ Authorization: SECRET }));
    expect(console.log).toHaveBeenCalledWith('File added: /Shared/Documents/a.txt');
    expect(console.log).toHaveBeenCalledWith('Link created by johndoe');
  });

  it('acknowledges unknown event types with 200', async () => {
    const body = JSON.stringify({ data: [{ eventId: 'e', eventType: 'user:create' }] });
    expect((await POST(makeRequest({ Authorization: SECRET }, body))).status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await POST(makeRequest({ Authorization: SECRET }, 'not json'))).status).toBe(400);
  });

  it('returns 400 when data is not an array', async () => {
    expect((await POST(makeRequest({ Authorization: SECRET }, '{"data":{}}'))).status).toBe(400);
    expect((await POST(makeRequest({ Authorization: SECRET }, '[1,2]'))).status).toBe(400);
  });
});

describe('verifyEgnyteRequest', () => {
  it('never accepts when EGNYTE_AUTHORIZATION is unset', () => {
    const headers = new Headers({ Authorization: 'Bearer x' });
    expect(verifyEgnyteRequest(headers, {})).toBe(false);
    expect(verifyEgnyteRequest(new Headers({ Authorization: '' }), { EGNYTE_AUTHORIZATION: '' })).toBe(false);
  });
});
