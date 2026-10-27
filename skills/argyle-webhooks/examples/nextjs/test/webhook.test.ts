import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { GET, POST, PUT, PATCH, DELETE } from '../app/webhooks/argyle/route';
import { verifyArgyleSignature } from '../lib/verify-argyle';

const SECRET = 'test_argyle_subscription_secret';
const URL = 'http://localhost:3000/webhooks/argyle';

beforeAll(() => {
  process.env.ARGYLE_WEBHOOK_SECRET = SECRET;
});

// Payloads follow the documented sample (event, name, data with ids).
const IDS = { account: '0187c66e-e7e5-811c-b006-2232f00f426a', user: '018051aa-f7a9-a0db-2f38-6cfa325e9d69' };
const PAYLOADS: Record<string, object> = {
  'accounts.connected': { event: 'accounts.connected', name: 'name-for-the-webhook-subscription', data: IDS },
  'gigs.fully_synced': { event: 'gigs.fully_synced', name: 'name-for-the-webhook-subscription', data: IDS },
  'identities.updated': { event: 'identities.updated', name: 'name-for-the-webhook-subscription', data: IDS },
  'items.removed': { event: 'items.removed', name: 'name-for-the-webhook-subscription', data: { items: ['item_000000001'] } },
};

// HMAC-SHA512 over the raw body bytes, bare hex digest, no prefix.
function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha512', secret).update(body).digest('hex');
}

function make(method: string, body?: string, headers: Record<string, string> = {}) {
  return new NextRequest(URL, { method, headers, ...(body === undefined ? {} : { body }) });
}

describe('Argyle webhook verification', () => {
  for (const [name, payload] of Object.entries(PAYLOADS)) {
    it(`accepts a validly signed ${name} event`, async () => {
      const body = JSON.stringify(payload);
      const res = await POST(make('POST', body, { 'content-type': 'application/json', 'x-argyle-signature': sign(body) }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });
  }

  const handlers = { POST, PUT, PATCH, DELETE };
  for (const [method, handler] of Object.entries(handlers)) {
    it(`accepts a signed ${method} request`, async () => {
      const body = JSON.stringify(PAYLOADS['accounts.connected']);
      const res = await handler(make(method, body, { 'content-type': 'application/json', 'x-argyle-signature': sign(body) }));
      expect(res.status).toBe(200);
    });
  }

  it('verifies the exact bytes, whatever the content type', async () => {
    const body = '{"event": "accounts.connected",  "data": {}}';
    const res = await POST(make('POST', body, { 'content-type': 'text/plain', 'x-argyle-signature': sign(body) }));
    expect(res.status).toBe(200);
  });

  it('accepts an uppercase hex digest', async () => {
    const body = JSON.stringify(PAYLOADS['accounts.connected']);
    const res = await POST(make('POST', body, { 'x-argyle-signature': sign(body).toUpperCase() }));
    expect(res.status).toBe(200);
  });

  it('verifies a GET with no body over zero bytes and acknowledges it with 200', async () => {
    const res = await GET(make('GET', undefined, { 'x-argyle-signature': sign('') }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('rejects an unsigned GET with 401', async () => {
    expect((await GET(make('GET'))).status).toBe(401);
  });

  it('rejects a missing or empty signature header', async () => {
    const body = JSON.stringify(PAYLOADS['accounts.connected']);
    expect((await POST(make('POST', body))).status).toBe(401);
    expect((await POST(make('POST', body, { 'x-argyle-signature': '' }))).status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = JSON.stringify(PAYLOADS['accounts.connected']);
    const res = await POST(make('POST', body, { 'x-argyle-signature': sign(body, 'another_secret') }));
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(PAYLOADS['accounts.connected']);
    const res = await POST(make('POST', body.replace('accounts', 'accountz'), { 'x-argyle-signature': sign(body) }));
    expect(res.status).toBe(401);
  });

  it('rejects malformed signatures (length, alphabet, prefix, trailing junk)', async () => {
    const body = JSON.stringify(PAYLOADS['accounts.connected']);
    const good = sign(body);
    const bad = [good.slice(0, -2), good + 'ab', good.slice(0, -1) + 'g', 'sha512=' + good, good + 'zz'];
    for (const signature of bad) {
      const res = await POST(make('POST', body, { 'x-argyle-signature': signature }));
      expect(res.status).toBe(401);
    }
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const body = 'not json';
    expect((await POST(make('POST', body, { 'x-argyle-signature': sign(body) }))).status).toBe(400);
  });

  it('returns 400 for a signed JSON body that is not an object', async () => {
    const body = '[1,2]';
    expect((await POST(make('POST', body, { 'x-argyle-signature': sign(body) }))).status).toBe(400);
  });

  it('acknowledges an event it does not handle', async () => {
    const body = JSON.stringify({ event: 'example.unhandled', name: 'n', data: {} });
    expect((await POST(make('POST', body, { 'x-argyle-signature': sign(body) }))).status).toBe(200);
  });
});

describe('verifyArgyleSignature', () => {
  const raw = new TextEncoder().encode('{"event":"accounts.connected"}');
  const sig = crypto.createHmac('sha512', SECRET).update(raw).digest('hex');

  it('accepts bytes and rejects when the secret is unset', () => {
    expect(verifyArgyleSignature(raw, sig, SECRET)).toBe(true);
    expect(verifyArgyleSignature(raw, sig, '')).toBe(false);
  });

  it('rejects null and undefined signatures', () => {
    expect(verifyArgyleSignature(raw, null, SECRET)).toBe(false);
    expect(verifyArgyleSignature(raw, undefined, SECRET)).toBe(false);
  });
});
