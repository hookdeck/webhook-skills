import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import * as route from '../app/webhooks/estuary/route';
import { classify, verifyEstuaryRequest } from '../lib/verify-estuary';

const SECRET = 'Bearer my-secret-token';

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

beforeEach(() => {
  process.env.ESTUARY_WEBHOOK_SECRET = SECRET;
  delete process.env.ESTUARY_WEBHOOK_HEADER; // default: Authorization
});

// ILLUSTRATIVE payloads: Estuary has no fixed event schema. A trigger body is the
// author's payloadTemplate; these use the documented template variables.
const trigger = {
  materialization_name: 'acmeCo/orders/to-warehouse',
  collection_names: ['acmeCo/orders'],
  run_id: 'run-0001',
};
const document = { id: 42, status: 'shipped' };

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
const METHODS: Method[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

function makeRequest(
  method: Method,
  headers: Record<string, string> = {},
  body?: string,
  contentType = 'application/json'
): NextRequest {
  const hasBody = body !== undefined && method !== 'GET';
  return new NextRequest('http://localhost:3000/webhooks/estuary', {
    method,
    headers: hasBody ? { 'Content-Type': contentType, ...headers } : headers,
    body: hasBody ? body : undefined,
  });
}

describe('Estuary webhook route', () => {
  it.each(['POST', 'PUT', 'PATCH'] as Method[])('accepts %s with the whole Authorization value', async (method) => {
    const res = await route[method](makeRequest(method, { Authorization: SECRET }, JSON.stringify(trigger)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it.each(['GET', 'DELETE'] as Method[])('accepts %s with an empty body', async (method) => {
    const res = await route[method](makeRequest(method, { Authorization: SECRET }));
    expect(res.status).toBe(200);
  });

  it.each(METHODS)('rejects %s without the header', async (method) => {
    const res = await route[method](makeRequest(method, {}, JSON.stringify(trigger)));
    expect(res.status).toBe(401);
  });

  it('rejects a wrong value', async () => {
    const res = await route.POST(makeRequest('POST', { Authorization: 'Bearer nope' }, JSON.stringify(trigger)));
    expect(res.status).toBe(401);
  });

  it('does not strip a Bearer prefix', async () => {
    const res = await route.POST(makeRequest('POST', { Authorization: 'my-secret-token' }, JSON.stringify(trigger)));
    expect(res.status).toBe(401);
  });

  it('rejects a longer value that starts with the secret', async () => {
    const res = await route.POST(makeRequest('POST', { Authorization: `${SECRET}x` }, JSON.stringify(trigger)));
    expect(res.status).toBe(401);
  });

  it('reads the header name from ESTUARY_WEBHOOK_HEADER, case-insensitively', async () => {
    process.env.ESTUARY_WEBHOOK_HEADER = 'X-Estuary-Secret';
    const ok = await route.POST(makeRequest('POST', { 'x-estuary-secret': SECRET }, JSON.stringify(trigger)));
    expect(ok.status).toBe(200);
    const wrong = await route.POST(makeRequest('POST', { Authorization: SECRET }, JSON.stringify(trigger)));
    expect(wrong.status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await route.POST(
      makeRequest('POST', { Authorization: SECRET }, JSON.stringify(document), 'text/plain')
    );
    expect(res.status).toBe(200);
  });

  it('accepts a non-JSON body once authenticated', async () => {
    const res = await route.POST(makeRequest('POST', { Authorization: SECRET }, 'plain text', 'text/plain'));
    expect(res.status).toBe(200);
  });
});

describe('helpers', () => {
  it('classifies payloads', () => {
    expect(classify(trigger)).toBe('trigger');
    expect(classify(document)).toBe('document');
    expect(classify(null)).toBe('empty');
  });

  it('never accepts when ESTUARY_WEBHOOK_SECRET is unset', () => {
    expect(verifyEstuaryRequest(new Headers({ Authorization: 'x' }), {})).toBe(false);
    expect(
      verifyEstuaryRequest(new Headers({ Authorization: '' }), { ESTUARY_WEBHOOK_SECRET: '' })
    ).toBe(false);
  });
});
