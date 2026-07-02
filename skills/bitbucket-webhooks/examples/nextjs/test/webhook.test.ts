import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Set test environment variables before the route reads them
beforeAll(() => {
  process.env.BITBUCKET_WEBHOOK_SECRET = 'test_bitbucket_secret';
});

import { POST, verifyBitbucketWebhook } from '../app/webhooks/bitbucket/route';

const webhookSecret = 'test_bitbucket_secret';

/**
 * Generate a valid Bitbucket signature for testing.
 * Matches Bitbucket's algorithm: HMAC-SHA256 hex over the raw body, sha256= prefix.
 */
function generateBitbucketSignature(payload: string, secret: string): string {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return `sha256=${signature}`;
}

function makeRequest(body: string, headers: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/bitbucket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });
}

describe('Bitbucket Signature Verification', () => {
  it('should validate correct signature', () => {
    const payload = JSON.stringify({ pullrequest: { id: 1, title: 'Test PR' } });
    const signature = generateBitbucketSignature(payload, webhookSecret);

    expect(verifyBitbucketWebhook(payload, signature, webhookSecret)).toBe(true);
  });

  it('should reject invalid signature', () => {
    const payload = JSON.stringify({ pullrequest: { id: 1 } });

    expect(verifyBitbucketWebhook(payload, 'sha256=invalid', webhookSecret)).toBe(false);
  });

  it('should reject missing signature', () => {
    const payload = JSON.stringify({ pullrequest: { id: 1 } });

    expect(verifyBitbucketWebhook(payload, null, webhookSecret)).toBe(false);
  });

  it('should reject tampered payload', () => {
    const original = JSON.stringify({ pullrequest: { id: 1 } });
    const signature = generateBitbucketSignature(original, webhookSecret);
    const tampered = JSON.stringify({ pullrequest: { id: 999 } });

    expect(verifyBitbucketWebhook(tampered, signature, webhookSecret)).toBe(false);
  });

  it('should reject wrong secret', () => {
    const payload = JSON.stringify({ pullrequest: { id: 1 } });
    const signature = generateBitbucketSignature(payload, webhookSecret);

    expect(verifyBitbucketWebhook(payload, signature, 'wrong_secret')).toBe(false);
  });

  it('should reject malformed signature header', () => {
    const payload = JSON.stringify({ pullrequest: { id: 1 } });

    expect(verifyBitbucketWebhook(payload, 'not_a_valid_format', webhookSecret)).toBe(false);
  });

  it('should match Bitbucket reference test vector', () => {
    const secret = "It's a Secret to Everybody";
    const body = 'Hello World!';
    const expected =
      'sha256=a4771c39fbe90f317c7824e83ddef3caae9cb3d976c214ace1f2937e133263c9';

    expect(verifyBitbucketWebhook(body, expected, secret)).toBe(true);
  });
});

describe('POST /webhooks/bitbucket', () => {
  it('should return 401 for missing signature', async () => {
    const req = makeRequest('{"push":{"changes":[]}}', {
      'X-Event-Key': 'repo:push',
      'X-Request-UUID': 'test-uuid',
    });

    const response = await POST(req);
    expect(response.status).toBe(401);
  });

  it('should return 401 for invalid signature', async () => {
    const req = makeRequest('{"push":{"changes":[]}}', {
      'X-Hub-Signature': 'sha256=invalid',
      'X-Event-Key': 'repo:push',
      'X-Request-UUID': 'test-uuid',
    });

    const response = await POST(req);
    expect(response.status).toBe(401);
  });

  it('should return 200 for valid repo:push', async () => {
    const payload = JSON.stringify({
      push: { changes: [{ new: { name: 'main' }, commits: [{ message: 'Test commit' }] }] },
    });
    const signature = generateBitbucketSignature(payload, webhookSecret);
    const req = makeRequest(payload, {
      'X-Hub-Signature': signature,
      'X-Event-Key': 'repo:push',
      'X-Request-UUID': 'test-uuid',
    });

    const response = await POST(req);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
  });

  it('should handle pullrequest:fulfilled event', async () => {
    const payload = JSON.stringify({ pullrequest: { id: 1, title: 'Test PR' } });
    const signature = generateBitbucketSignature(payload, webhookSecret);
    const req = makeRequest(payload, {
      'X-Hub-Signature': signature,
      'X-Event-Key': 'pullrequest:fulfilled',
      'X-Request-UUID': 'test-uuid',
    });

    const response = await POST(req);
    expect(response.status).toBe(200);
  });
});

describe('Bitbucket Signature Generation', () => {
  it('should generate sha256 prefixed signature', () => {
    const signature = generateBitbucketSignature('{"test":true}', 'test_secret');

    expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it('should generate different signatures for different payloads', () => {
    const sig1 = generateBitbucketSignature('{"id":1}', 'test_secret');
    const sig2 = generateBitbucketSignature('{"id":2}', 'test_secret');

    expect(sig1).not.toBe(sig2);
  });
});
