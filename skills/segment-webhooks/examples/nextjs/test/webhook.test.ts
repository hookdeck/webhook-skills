import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { verifySegmentSignature } from '../lib/verify-segment';
import { POST } from '../app/webhooks/segment/route';

// Segment shared secrets are any string you choose in Destination Settings
const SECRET = 'test_segment_shared_secret';

beforeEach(() => {
  process.env.SEGMENT_SHARED_SECRET = SECRET;
});

/**
 * Sign like Segment: hex(HMAC-SHA1(secret, content))
 */
function sign(content: string, secret = SECRET): string {
  return crypto.createHmac('sha1', secret).update(content, 'utf8').digest('hex');
}

function makeRequest(body: string, signature?: string): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (signature) headers['X-Signature'] = signature;
  return new Request('http://localhost/webhooks/segment', {
    method: 'POST',
    headers,
    body,
  }) as unknown as NextRequest;
}

const trackEvent = {
  type: 'track',
  messageId: 'msg-track-1',
  userId: '019mr8mf4r',
  event: 'Purchased an Item',
  properties: { revenue: '39.95', shippingMethod: '2-day' },
  timestamp: '2012-12-02T00:30:08.276Z',
};

const identifyEvent = {
  type: 'identify',
  messageId: 'msg-identify-1',
  userId: '019mr8mf4r',
  traits: { email: 'achilles@segment.com', name: 'Achilles', name_ja: 'アキレス' },
  timestamp: '2012-12-02T00:30:08.276Z',
};

describe('verifySegmentSignature', () => {
  it('accepts a valid signature over the raw body', () => {
    const body = JSON.stringify(trackEvent);
    expect(verifySegmentSignature(body, sign(body), SECRET)).toBe(true);
  });

  it('produces a 40-char hex HMAC-SHA1 digest', () => {
    expect(sign('{}')).toMatch(/^[a-f0-9]{40}$/);
  });

  it('rejects a SHA-256 signature', () => {
    const body = JSON.stringify(trackEvent);
    const sha256 = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
    expect(verifySegmentSignature(body, sha256, SECRET)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const body = JSON.stringify(trackEvent);
    expect(verifySegmentSignature(body.replace('39.95', '0.01'), sign(body), SECRET)).toBe(false);
  });

  it('rejects the wrong secret', () => {
    const body = JSON.stringify(trackEvent);
    expect(verifySegmentSignature(body, sign(body, 'wrong'), SECRET)).toBe(false);
  });

  it('rejects missing signature or secret', () => {
    const body = JSON.stringify(trackEvent);
    expect(verifySegmentSignature(body, null, SECRET)).toBe(false);
    expect(verifySegmentSignature(body, sign(body), undefined)).toBe(false);
  });

  it('accepts a batch signed over the first event only', () => {
    const batch = [identifyEvent, trackEvent];
    expect(verifySegmentSignature(JSON.stringify(batch), sign(JSON.stringify(batch[0])), SECRET)).toBe(true);
  });

  it('rejects a batch when the signature covers a different event', () => {
    const body = JSON.stringify([trackEvent, identifyEvent]);
    expect(verifySegmentSignature(body, sign(JSON.stringify(identifyEvent)), SECRET)).toBe(false);
  });

  it('documents the caveat: a raw-body HMAC does not match a Segment batch signature', () => {
    const batch = [trackEvent, identifyEvent];
    expect(sign(JSON.stringify(batch))).not.toBe(sign(JSON.stringify(batch[0])));
  });
});

describe('POST /webhooks/segment', () => {
  it('returns 400 when X-Signature is missing', async () => {
    const res = await POST(makeRequest(JSON.stringify(trackEvent)));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing X-Signature header' });
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await POST(makeRequest(JSON.stringify(trackEvent), 'a'.repeat(40)));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid signature' });
  });

  it.each([
    ['track', trackEvent],
    ['identify', identifyEvent],
    ['page', { type: 'page', userId: 'u1', properties: { path: '/pricing' } }],
    ['screen', { type: 'screen', userId: 'u1', name: 'Main Screen' }],
    ['group', { type: 'group', userId: 'u1', groupId: 'g1', traits: { name: 'Initech' } }],
    ['alias', { type: 'alias', previousId: 'anon-1', userId: 'u1' }],
    ['delete', { type: 'delete', userId: 'u1' }],
  ])('accepts a signed %s call', async (_type, event) => {
    const body = JSON.stringify(event);
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, count: 1 });
  });

  it('accepts a signed batched delivery', async () => {
    const batch = [identifyEvent, trackEvent, { type: 'page', name: 'Home' }];
    const res = await POST(makeRequest(JSON.stringify(batch), sign(JSON.stringify(batch[0]))));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, count: 3 });
  });

  it('rejects a batch whose first event was altered', async () => {
    const signature = sign(JSON.stringify(trackEvent));
    const tampered = [{ ...trackEvent, event: 'Refunded' }, identifyEvent];
    const res = await POST(makeRequest(JSON.stringify(tampered), signature));
    expect(res.status).toBe(400);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.SEGMENT_SHARED_SECRET;
    const body = JSON.stringify(trackEvent);
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(500);
  });
});
