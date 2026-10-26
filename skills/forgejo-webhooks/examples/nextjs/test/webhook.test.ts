import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/forgejo/route';
import { verifyForgejoWebhook } from '../lib/verify';

const secret = 'test_forgejo_secret';

// Trimmed from Forgejo's documented push example
const pushPayload = JSON.stringify({
  ref: 'refs/heads/develop',
  before: '28e1879d029cb852e4844d9c718537df08844e03',
  after: 'bffeb74224043ba2feb48d137756c8a9331c449a',
  commits: [{ id: 'bffeb74224043ba2feb48d137756c8a9331c449a', message: 'Webhooks Yay!' }],
  repository: { id: 140, name: 'webhooks', full_name: 'forgejo/webhooks' },
  pusher: { id: 1, login: 'forgejo' },
  sender: { id: 1, login: 'forgejo' },
});

// Forgejo's X-Forgejo-Signature is the bare hex HMAC-SHA256 of the body
function sign(payload: string | Buffer, key: string = secret): string {
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

function makeRequest(
  event: string | null,
  body: string,
  { signature, contentType = 'application/json' }: { signature?: string | null; contentType?: string } = {}
): NextRequest {
  const headers: Record<string, string> = { 'content-type': contentType, 'x-forgejo-delivery': 'test-delivery-id' };
  if (event) headers['x-forgejo-event-type'] = event;
  const sig = signature === undefined ? sign(body) : signature;
  if (sig !== null) headers['x-forgejo-signature'] = sig;
  return new NextRequest('http://localhost:3000/webhooks/forgejo', { method: 'POST', headers, body });
}

describe('verifyForgejoWebhook', () => {
  const payload = Buffer.from('{"action":"opened"}');

  it('returns true for a valid signature', () => {
    expect(verifyForgejoWebhook(payload, sign(payload), secret)).toBe(true);
  });

  it('accepts an uppercase hex signature', () => {
    expect(verifyForgejoWebhook(payload, sign(payload).toUpperCase(), secret)).toBe(true);
  });

  it('returns false for a wrong-secret signature', () => {
    expect(verifyForgejoWebhook(payload, sign(payload, 'wrong_secret'), secret)).toBe(false);
  });

  it.each([
    ['null', null],
    ['empty', ''],
    ['too short', 'deadbeef'],
    ['non-hex', 'z'.repeat(64)],
    ['sha256= prefixed', `sha256=${'a'.repeat(64)}`],
  ])('returns false for a %s signature', (_name, sig) => {
    expect(verifyForgejoWebhook(payload, sig, secret)).toBe(false);
  });

  it('returns false when no secret is configured', () => {
    expect(verifyForgejoWebhook(payload, sign(payload, ''), undefined)).toBe(false);
    expect(verifyForgejoWebhook(payload, sign(payload, ''), '')).toBe(false);
  });
});

describe('POST /webhooks/forgejo', () => {
  beforeAll(() => {
    process.env.FORGEJO_WEBHOOK_SECRET = secret;
  });

  it.each([
    ['missing', null],
    ['empty', ''],
    ['malformed', 'deadbeef'],
    ['wrong-secret', sign(pushPayload, 'wrong_secret')],
  ])('returns 401 for a %s signature', async (_name, signature) => {
    const response = await POST(makeRequest('push', pushPayload, { signature }));
    expect(response.status).toBe(401);
  });

  it('returns 401 when the body was changed after signing', async () => {
    const response = await POST(
      makeRequest('push', pushPayload.replace('develop', 'main'), { signature: sign(pushPayload) })
    );
    expect(response.status).toBe(401);
  });

  it('returns 401 for a form-encoded body (signature covers the JSON payload, not the body)', async () => {
    const form = `payload=${encodeURIComponent(pushPayload)}`;
    const response = await POST(
      makeRequest('push', form, { contentType: 'application/x-www-form-urlencoded', signature: sign(pushPayload) })
    );
    expect(response.status).toBe(401);
  });

  it.each([
    ['push', JSON.parse(pushPayload)],
    ['pull_request', { action: 'opened', number: 1, pull_request: { title: 'Test PR' } }],
    ['issues', { action: 'opened', issue: { number: 1, title: 'Test Issue' } }],
    ['issue_comment', { action: 'created', issue: { number: 1 }, comment: { user: { login: 'forgejo' } } }],
    ['pull_request_comment', { action: 'created', issue: { number: 2 }, comment: { user: { login: 'forgejo' } } }],
    ['create', { ref_type: 'branch', ref: 'feature' }],
    ['delete', { ref_type: 'branch', ref: 'feature' }],
    ['release', { action: 'published', release: { tag_name: 'v1.0.0' } }],
    ['issue_assign', { action: 'assigned', issue: { number: 1 } }],
  ])('returns 200 for a valid %s event', async (event, payload) => {
    const response = await POST(makeRequest(event, JSON.stringify(payload)));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
  });

  it('verifies any content type by reading the raw body', async () => {
    const response = await POST(makeRequest('push', pushPayload, { contentType: 'text/plain' }));
    expect(response.status).toBe(200);
  });

  it('returns 400 for a validly signed body that is not JSON', async () => {
    const response = await POST(makeRequest('push', 'not json'));
    expect(response.status).toBe(400);
  });
});
