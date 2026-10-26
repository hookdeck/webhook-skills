import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { GET, POST, PUT, PATCH, DELETE } from '../app/webhooks/spacelift/route';
import { classify, verifySpaceliftSignature } from '../lib/verify-spacelift';

const SECRET = 'test_spacelift_secret_0123456789';

beforeAll(() => {
  process.env.SPACELIFT_WEBHOOK_SECRET = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  process.env.SPACELIFT_WEBHOOK_SECRET = SECRET;
});

// Payloads from Spacelift's documentation
const runPayload = {
  account: 'spacelift-io',
  state: 'FINISHED',
  stateVersion: 4,
  timestamp: 1596979684,
  run: {
    id: '01EF9PFPNFFM2MQXTJKHK1B869',
    branch: 'master',
    commit: { authorLogin: 'marcinwyszynski', hash: '0ee3a3b7266daf5a1d44a193a0f48ce995fa75eb', message: 'Update demo.tf' },
    createdAt: 1596979665,
    delta: { added: 0, changed: 0, deleted: 0, resources: 1 },
    triggeredBy: 'marcinw@spacelift.io',
    type: 'TRACKED',
  },
  stack: { id: 'spacelift-demo', name: 'Spacelift demo', description: '', labels: [] },
};
const errorPayload = {
  title: 'Invalid Stack Slug Triggered',
  body: "policy tried to trigger Stack 'this-is-not-a-stack' which either doesn't exist or this policy doesn't have access to",
  error: "policy triggered for Stack that doesn't exist",
  severity: 'ERROR',
  account: 'spacelift-io',
};

function sign(body: string | Buffer, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function makeRequest(method: string, body: string | null, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/spacelift', {
    method,
    headers: body === null ? headers : { 'content-type': 'application/json', ...headers },
    body: body === null ? undefined : body,
  });
}

describe('verifySpaceliftSignature', () => {
  const body = Buffer.from(JSON.stringify(runPayload));

  it('accepts sha256=<hex>, the bare digest and uppercase hex', () => {
    expect(verifySpaceliftSignature(body, `sha256=${sign(body)}`, SECRET)).toBe(true);
    expect(verifySpaceliftSignature(body, sign(body), SECRET)).toBe(true);
    expect(verifySpaceliftSignature(body, sign(body).toUpperCase(), SECRET)).toBe(true);
  });
  it('rejects wrong secret, tampered body and no secret', () => {
    expect(verifySpaceliftSignature(body, sign(body, 'other'), SECRET)).toBe(false);
    expect(verifySpaceliftSignature(Buffer.from('{}'), sign(body), SECRET)).toBe(false);
    expect(verifySpaceliftSignature(body, sign(body), '')).toBe(false);
  });
  it('rejects missing, empty and malformed headers', () => {
    expect(verifySpaceliftSignature(body, null, SECRET)).toBe(false);
    expect(verifySpaceliftSignature(body, '', SECRET)).toBe(false);
    expect(verifySpaceliftSignature(body, 'sha256=abc', SECRET)).toBe(false);
    expect(verifySpaceliftSignature(body, 'z'.repeat(64), SECRET)).toBe(false);
    expect(verifySpaceliftSignature(body, sign(body) + '00', SECRET)).toBe(false);
  });
});

describe('classify', () => {
  it('recognises run and internal error payloads', () => {
    expect(classify(runPayload)).toBe('run');
    expect(classify(errorPayload)).toBe('internal_error');
    expect(classify({ foo: 1 })).toBe('unknown');
    expect(classify(null)).toBe('unknown');
  });
});

describe('POST /webhooks/spacelift', () => {
  it('handles a signed run message', async () => {
    const body = JSON.stringify(runPayload);
    const res = await POST(makeRequest('POST', body, { 'x-signature-256': `sha256=${sign(body)}` }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, type: 'run' });
  });

  it('handles a signed internal error message', async () => {
    const body = JSON.stringify(errorPayload);
    const res = await POST(makeRequest('POST', body, { 'x-signature-256': sign(body) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, type: 'internal_error' });
  });

  it('verifies the exact bytes, not re-serialized JSON', async () => {
    const body = JSON.stringify(runPayload, null, 2);
    const ok = await POST(makeRequest('POST', body, { 'x-signature-256': sign(body) }));
    expect(ok.status).toBe(200);
    const bad = await POST(makeRequest('POST', body, { 'x-signature-256': sign(JSON.stringify(runPayload)) }));
    expect(bad.status).toBe(401);
  });

  it('rejects a missing signature, a SHA-1 X-Signature only, and a bad signature', async () => {
    const body = JSON.stringify(runPayload);
    expect((await POST(makeRequest('POST', body))).status).toBe(401);
    const sha1 = crypto.createHmac('sha1', SECRET).update(body).digest('hex');
    expect((await POST(makeRequest('POST', body, { 'x-signature': `sha1=${sha1}` }))).status).toBe(401);
    expect((await POST(makeRequest('POST', body, { 'x-signature-256': sign(body, 'wrong') }))).status).toBe(401);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await POST(makeRequest('POST', body, { 'x-signature-256': sign(body) }));
    expect(res.status).toBe(400);
  });
});

describe('other HTTP methods', () => {
  it.each([
    ['PUT', PUT],
    ['PATCH', PATCH],
    ['DELETE', DELETE],
  ])('verifies and handles %s', async (method, handler) => {
    const body = JSON.stringify(runPayload);
    const ok = await handler(makeRequest(method, body, { 'x-signature-256': sign(body) }));
    expect(ok.status).toBe(200);
    const bad = await handler(makeRequest(method, body, { 'x-signature-256': sign(body, 'wrong') }));
    expect(bad.status).toBe(401);
  });

  it('verifies a GET with no body over zero bytes', async () => {
    const ok = await GET(makeRequest('GET', null, { 'x-signature-256': sign(Buffer.alloc(0)) }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).type).toBe('unknown');
    expect((await GET(makeRequest('GET', null))).status).toBe(401);
  });
});
