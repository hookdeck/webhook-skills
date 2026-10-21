import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { verifyZernioWebhook } from '../lib/verify';
import { POST } from '../app/webhooks/zernio/route';

const secret = 'test_zernio_secret';

beforeAll(() => {
  process.env.ZERNIO_WEBHOOK_SECRET = secret;
});

/**
 * Generate a valid Zernio signature: lowercase hex HMAC-SHA256 of the raw body
 */
function generateZernioSignature(payload: string, key: string): string {
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

function makePayload(event: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: crypto.randomUUID(),
    event,
    timestamp: '2027-01-01T17:00:00Z',
    ...extra,
  });
}

function makeRequest(body: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/zernio', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('verifyZernioWebhook', () => {
  it('returns true for a valid signature', () => {
    const payload = '{"event":"post.published"}';
    expect(verifyZernioWebhook(payload, generateZernioSignature(payload, secret), secret)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    expect(verifyZernioWebhook('{"event":"post.published"}', 'invalid', secret)).toBe(false);
  });

  it('returns false for a same-length wrong signature', () => {
    expect(verifyZernioWebhook('{"event":"post.published"}', 'a'.repeat(64), secret)).toBe(false);
  });

  it('returns false for a missing signature or secret', () => {
    expect(verifyZernioWebhook('{}', null, secret)).toBe(false);
    expect(verifyZernioWebhook('{}', 'abc', undefined)).toBe(false);
  });

  it('returns false when the body was altered', () => {
    const signature = generateZernioSignature('{"a":1}', secret);
    expect(verifyZernioWebhook('{"a":2}', signature, secret)).toBe(false);
  });
});

describe('POST /webhooks/zernio', () => {
  it('returns 401 for a missing signature', async () => {
    const response = await POST(makeRequest(makePayload('post.published')));
    expect(response.status).toBe(401);
  });

  it('returns 400 for an invalid signature', async () => {
    const response = await POST(
      makeRequest(makePayload('post.published'), { 'x-zernio-signature': 'invalid' })
    );
    expect(response.status).toBe(400);
  });

  it('returns 400 for a signature made with the wrong secret', async () => {
    const payload = makePayload('post.published');
    const response = await POST(
      makeRequest(payload, { 'x-zernio-signature': generateZernioSignature(payload, 'wrong_secret') })
    );
    expect(response.status).toBe(400);
  });

  it.each([
    ['post.scheduled', { post: { id: 'p1', scheduledFor: '2027-01-01T17:00:00Z' } }],
    ['post.published', { post: { id: 'p1', platforms: [] } }],
    ['post.partial', { post: { id: 'p1' } }],
    ['post.failed', { post: { id: 'p1' } }],
    ['post.platform.published', { post: { id: 'p1' } }],
    ['post.platform.failed', { post: { id: 'p1' } }],
    ['message.received', { message: { platform: 'instagram', text: 'hi' } }],
    ['comment.received', { account: { accountId: 'a1' } }],
    ['account.connected', { account: { platform: 'twitter', username: 'acme' } }],
    ['account.disconnected', { account: { disconnectionType: 'unintentional', reason: 'token expired' } }],
    ['webhook.test', { message: 'This is a test webhook from Zernio' }],
  ])('accepts a valid %s event', async (event, extra) => {
    const payload = makePayload(event, extra);
    const response = await POST(
      makeRequest(payload, { 'x-zernio-signature': generateZernioSignature(payload, secret) })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
  });

  it('accepts the legacy X-Late-Signature header', async () => {
    const payload = makePayload('post.published');
    const response = await POST(
      makeRequest(payload, { 'x-late-signature': generateZernioSignature(payload, secret) })
    );
    expect(response.status).toBe(200);
  });

  it('acknowledges unhandled events', async () => {
    const payload = makePayload('lead.received');
    const response = await POST(
      makeRequest(payload, { 'x-zernio-signature': generateZernioSignature(payload, secret) })
    );
    expect(response.status).toBe(200);
  });

  it('deduplicates redelivered events', async () => {
    const payload = makePayload('post.published');
    const headers = { 'x-zernio-signature': generateZernioSignature(payload, secret) };

    const first = await POST(makeRequest(payload, headers));
    const second = await POST(makeRequest(payload, headers));

    expect(await first.json()).toEqual({ received: true });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ received: true, duplicate: true });
  });

  it('returns 400 for malformed JSON that is correctly signed', async () => {
    const payload = 'not json';
    const response = await POST(
      makeRequest(payload, { 'x-zernio-signature': generateZernioSignature(payload, secret) })
    );
    expect(response.status).toBe(400);
  });
});
