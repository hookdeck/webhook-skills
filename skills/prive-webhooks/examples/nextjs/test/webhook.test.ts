import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

// Set test environment variables before importing the routes
process.env.PRIVE_WEBHOOK_SECRET = 'test_prive_secret_token';

import { POST } from '../app/webhooks/prive/route';
import { POST as POST_TOPIC } from '../app/webhooks/prive/[topic]/route';
import { verifyPriveSignature, TOPICS } from '../lib/prive';

const secret = process.env.PRIVE_WEBHOOK_SECRET;

// Prive: bare base64 HMAC-SHA256 of the raw body
function sign(payload: string, key = secret): string {
  return crypto.createHmac('sha256', key).update(payload).digest('base64');
}

function makeRequest(path: string, body: string, headers: Record<string, string> = {}) {
  return new Request(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  }) as any;
}

describe('verifyPriveSignature', () => {
  const payload = '{"id":"sub_123"}';

  it('accepts a valid signature', () => {
    expect(verifyPriveSignature(payload, sign(payload), secret)).toBe(true);
  });

  it('rejects a missing signature', () => {
    expect(verifyPriveSignature(payload, null, secret)).toBe(false);
  });

  it('rejects a wrong secret', () => {
    expect(verifyPriveSignature(payload, sign(payload, 'wrong'), secret)).toBe(false);
  });

  it('rejects a tampered body', () => {
    expect(verifyPriveSignature('{"id":"sub_999"}', sign(payload), secret)).toBe(false);
  });

  it('rejects a hex digest', () => {
    const hex = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    expect(verifyPriveSignature(payload, hex, secret)).toBe(false);
  });

  it('rejects trailing junk after a valid base64 digest', () => {
    expect(verifyPriveSignature(payload, `${sign(payload)}AAAA`, secret)).toBe(false);
  });

  it('rejects a non-ASCII header without throwing', () => {
    expect(verifyPriveSignature(payload, 'ünïcode', secret)).toBe(false);
  });
});

describe('POST /webhooks/prive', () => {
  it('returns 200 for a valid signature', async () => {
    const payload = JSON.stringify({ id: 'sub_123' });
    const res = await POST(
      makeRequest('/webhooks/prive', payload, { 'x-prive-hmac-sha256': sign(payload) })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('returns 401 for a missing signature', async () => {
    const res = await POST(makeRequest('/webhooks/prive', '{"id":"sub_123"}'));
    expect(res.status).toBe(401);
  });

  it('returns 401 for an invalid signature', async () => {
    const res = await POST(
      makeRequest('/webhooks/prive', '{"id":"sub_123"}', { 'x-prive-hmac-sha256': 'invalid' })
    );
    expect(res.status).toBe(401);
  });

  it('verifies any content type', async () => {
    const payload = '{"id":"sub_123"}';
    const req = makeRequest('/webhooks/prive', payload, {
      'content-type': 'text/plain',
      'x-prive-hmac-sha256': sign(payload),
    });
    expect((await POST(req)).status).toBe(200);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const payload = 'not json';
    const res = await POST(
      makeRequest('/webhooks/prive', payload, { 'x-prive-hmac-sha256': sign(payload) })
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /webhooks/prive/[topic]', () => {
  const ctx = (topic: string) => ({ params: Promise.resolve({ topic }) });

  it.each(Object.keys(TOPICS))('accepts a signed %s webhook', async (slug) => {
    const payload = JSON.stringify({ id: 'abc' });
    const res = await POST_TOPIC(
      makeRequest(`/webhooks/prive/${slug}`, payload, { 'x-prive-hmac-sha256': sign(payload) }),
      ctx(slug)
    );
    expect(res.status).toBe(200);
  });

  it('maps slugs to the documented topics', () => {
    expect(Object.values(TOPICS).sort()).toEqual(
      [
        'subscriptions/created',
        'subscriptions/line_removed',
        'subscriptions/status/updated',
        'orders/created',
        'billingAttempts/created',
        'billingAttempts/success',
        'billingAttempts/failed',
        'paymentMethod/updated',
        'subscriptionActivities/created',
        'subscription/customAttributes/updated',
      ].sort()
    );
  });

  it('returns 404 for an unknown topic', async () => {
    const res = await POST_TOPIC(makeRequest('/webhooks/prive/nope', '{}'), ctx('nope'));
    expect(res.status).toBe(404);
  });

  it('returns 404 for a prototype-key topic', async () => {
    const res = await POST_TOPIC(makeRequest('/webhooks/prive/constructor', '{}'), ctx('constructor'));
    expect(res.status).toBe(404);
  });

  it('returns 401 for a bad signature on a topic path', async () => {
    const res = await POST_TOPIC(
      makeRequest('/webhooks/prive/billing-attempts-failed', '{}', { 'x-prive-hmac-sha256': 'bad' }),
      ctx('billing-attempts-failed')
    );
    expect(res.status).toBe(401);
  });
});
