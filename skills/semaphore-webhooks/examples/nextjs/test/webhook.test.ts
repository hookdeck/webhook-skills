import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { DELETE, GET, PATCH, POST, PUT } from '../app/webhooks/semaphore/route';
import { verifySemaphoreSignature } from '../lib/verify-semaphore';

const SECRET = 'semaphore-test-secret';
const URL = 'http://localhost:3000/webhooks/semaphore';

// Signed exactly as Semaphore signs: lowercase hex HMAC-SHA256 of the raw body, no prefix.
function sign(body: string | Buffer, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

// Trimmed from the payload in Semaphore's notification docs.
const pipelineDone = (result = 'passed') => ({
  version: '1.0.0',
  organization: { name: 'semaphore', id: '36360e31-fee6-42b2-9f6c-999d4c06ce81' },
  project: { name: 'notifications', id: '91e34570-bebe-42b6-b47a-ca710b2b8927' },
  repository: { url: 'https://github.com/semaphoreci/myproject', slug: 'semaphoreci/notifications' },
  revision: { reference: 'refs/heads/rw/webhook_impl', commit_sha: '2d9f5fcec1ca7c68fa7bd44dd58ec4ff65814563' },
  workflow: { id: 'acabe58e-4bcc-4d39-be06-e98d71917703' },
  pipeline: { id: 'fa02c7bd-7a8b-42e0-8d6e-aa0d8a194e19', name: 'Notificaitons', state: 'done', result },
  blocks: [{ name: 'Lint', result, jobs: [{ name: 'Lint', status: 'finished', result }] }],
});

function req(method: string, headers: Record<string, string> = {}, body?: string): NextRequest {
  return new NextRequest(URL, { method, headers, body });
}

const post = (body: string, headers: Record<string, string> = {}) => POST(req('POST', headers, body));

beforeEach(() => {
  process.env.SEMAPHORE_WEBHOOK_SECRET = SECRET;
});

describe('verifySemaphoreSignature', () => {
  const body = Buffer.from('{"a":1}');

  it('accepts a valid hex signature, in either case', () => {
    expect(verifySemaphoreSignature(body, sign(body))).toBe(true);
    expect(verifySemaphoreSignature(body, sign(body).toUpperCase())).toBe(true);
  });

  it('rejects wrong secret, tampered body and missing signature', () => {
    expect(verifySemaphoreSignature(body, sign(body, 'other'))).toBe(false);
    expect(verifySemaphoreSignature(Buffer.from('{"a":2}'), sign(body))).toBe(false);
    expect(verifySemaphoreSignature(body, null)).toBe(false);
    expect(verifySemaphoreSignature(body, '')).toBe(false);
  });

  it('rejects malformed values: prefix, wrong length, non-hex', () => {
    expect(verifySemaphoreSignature(body, `sha256=${sign(body)}`)).toBe(false);
    expect(verifySemaphoreSignature(body, sign(body).slice(0, 63))).toBe(false);
    expect(verifySemaphoreSignature(body, sign(body) + 'a')).toBe(false);
    expect(verifySemaphoreSignature(body, 'z'.repeat(64))).toBe(false);
  });
});

describe('POST /webhooks/semaphore', () => {
  it.each(['passed', 'failed', 'stopped', 'canceled'])('accepts a signed %s pipeline', async (result) => {
    const body = JSON.stringify(pipelineDone(result));
    const res = await post(body, {
      'content-type': 'application/json',
      'x-semaphore-signature-256': sign(body),
      'x-semaphore-webhook-id': 'b1f2c3d4',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts an unknown result and any content type', async () => {
    const body = JSON.stringify(pipelineDone('something-new'));
    const res = await post(body, { 'content-type': 'text/plain', 'x-semaphore-signature-256': sign(body) });
    expect(res.status).toBe(200);
  });

  it('verifies the exact bytes, not a re-serialized body', async () => {
    const body = JSON.stringify(pipelineDone(), null, 2);
    expect((await post(body, { 'x-semaphore-signature-256': sign(body) })).status).toBe(200);
    const reserialized = sign(JSON.stringify(JSON.parse(body)));
    expect((await post(body, { 'x-semaphore-signature-256': reserialized })).status).toBe(401);
  });

  it('rejects a missing, wrong, malformed or prefixed signature with 401', async () => {
    const body = JSON.stringify(pipelineDone());
    expect((await post(body)).status).toBe(401);
    expect((await post(body, { 'x-semaphore-signature-256': sign(body, 'wrong') })).status).toBe(401);
    expect((await post(body, { 'x-semaphore-signature-256': 'abc' })).status).toBe(401);
    expect((await post(body, { 'x-semaphore-signature-256': `sha256=${sign(body)}` })).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(pipelineDone('passed'));
    const res = await post(body.replace('passed', 'failed'), { 'x-semaphore-signature-256': sign(body) });
    expect(res.status).toBe(401);
  });

  it('returns 400 for a signed body that is not a JSON object', async () => {
    for (const body of ['not json', '[1,2]']) {
      expect((await post(body, { 'x-semaphore-signature-256': sign(body) })).status).toBe(400);
    }
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.SEMAPHORE_WEBHOOK_SECRET;
    const body = JSON.stringify(pipelineDone());
    expect((await post(body, { 'x-semaphore-signature-256': sign(body) })).status).toBe(500);
  });
});

describe('other HTTP methods', () => {
  const handlers = { PUT, PATCH } as const;

  it.each(['PUT', 'PATCH'] as const)('verifies and acknowledges a signed %s with a body', async (method) => {
    const body = JSON.stringify(pipelineDone());
    const res = await handlers[method](req(method, { 'x-semaphore-signature-256': sign(body) }, body));
    expect(res.status).toBe(200);
  });

  it('verifies an empty GET and DELETE over zero bytes and returns 200', async () => {
    const headers = { 'x-semaphore-signature-256': sign('') };
    expect((await GET(req('GET', headers))).status).toBe(200);
    expect((await DELETE(req('DELETE', headers))).status).toBe(200);
  });

  it('rejects an unsigned GET with 401', async () => {
    expect((await GET(req('GET'))).status).toBe(401);
  });
});
