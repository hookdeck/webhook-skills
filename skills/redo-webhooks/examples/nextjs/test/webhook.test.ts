import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/redo/route';
import { classify, verifyRedoRequest } from '../lib/verify-redo';

const AUTH = 'Bearer your-subscriber-secret-123';

beforeAll(() => {
  process.env.REDO_AUTHORIZATION = AUTH;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

// Shapes taken from Redo's documented sample payload (trimmed)
const created = {
  type: 'created',
  at: '2023-08-18T12:00:00Z',
  merchantName: 'Example Merchant',
  return: { id: '64df65d4c5a4ca3eff4b4e43', status: 'pending' },
  order: { id: 'shopify-order-123' },
};
const updated = { ...created, type: 'updated', return: { ...created.return, status: 'approved' } };
const backfill = { ...created, type: 'backfill' };

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(created),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/redo', {
    method: 'POST',
    headers: { 'Content-Type': contentType, ...headers },
    body,
  });
}

describe('Redo webhook route', () => {
  it('accepts the full Authorization header value', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('rejects a missing Authorization header', async () => {
    expect((await POST(makeRequest())).status).toBe(401);
  });

  it('rejects a wrong secret', async () => {
    const res = await POST(makeRequest({ Authorization: 'Bearer some-other-secret' }));
    expect(res.status).toBe(401);
  });

  it('rejects the secret without the "Bearer " prefix', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH.replace('Bearer ', '') }));
    expect(res.status).toBe(401);
  });

  it('rejects a different scheme with the same secret', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH.replace('Bearer', 'Basic') }));
    expect(res.status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH }, JSON.stringify(updated), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await POST(makeRequest({ Authorization: AUTH }, 'not json'))).status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    expect((await POST(makeRequest({ Authorization: AUTH }, '[1,2]'))).status).toBe(400);
  });

  it('does not parse the body before the credential check', async () => {
    expect((await POST(makeRequest({}, 'not json'))).status).toBe(401);
  });

  it('accepts updated, backfill and unknown event types', async () => {
    expect((await POST(makeRequest({ Authorization: AUTH }, JSON.stringify(updated)))).status).toBe(200);
    expect((await POST(makeRequest({ Authorization: AUTH }, JSON.stringify(backfill)))).status).toBe(200);
    expect((await POST(makeRequest({ Authorization: AUTH }, '{"type":"other"}'))).status).toBe(200);
  });
});

describe('helpers', () => {
  it('maps payload types to topics', () => {
    expect(classify(created)).toBe('return.created');
    expect(classify(updated)).toBe('return.updated');
    expect(classify(backfill)).toBe('backfill');
    expect(classify({ type: 'x' })).toBeNull();
  });

  it('never accepts when REDO_AUTHORIZATION is unset', () => {
    expect(verifyRedoRequest(new Headers({ Authorization: 'Bearer x' }), {})).toBe(false);
    expect(verifyRedoRequest(new Headers({ Authorization: '' }), { REDO_AUTHORIZATION: '' })).toBe(false);
  });
});
