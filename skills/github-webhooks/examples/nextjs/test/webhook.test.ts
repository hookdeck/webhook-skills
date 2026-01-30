import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Set test environment variables
beforeAll(() => {
  process.env.GITHUB_WEBHOOK_SECRET = 'test_github_secret';
});

/**
 * Generate a valid GitHub signature for testing
 */
function generateGitHubSignature(payload: string, secret: string): string {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return `sha256=${signature}`;
}

/**
 * Verify GitHub webhook signature (same logic as in route.ts)
 */
function verifyGitHubWebhook(body: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) {
    return false;
  }

  // Extract the signature from the header (format: sha256=<hex>)
  const signature = signatureHeader.replace('sha256=', '');

  // Compute expected signature
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

describe('GitHub Signature Verification', () => {
  const webhookSecret = 'test_github_secret';

  it('should validate correct signature', () => {
    const payload = JSON.stringify({
      action: 'opened',
      pull_request: { number: 1, title: 'Test PR' }
    });
    const signature = generateGitHubSignature(payload, webhookSecret);
    
    expect(verifyGitHubWebhook(payload, signature, webhookSecret)).toBe(true);
  });

  it('should reject invalid signature', () => {
    const payload = JSON.stringify({ action: 'opened' });
    
    expect(verifyGitHubWebhook(payload, 'sha256=invalid', webhookSecret)).toBe(false);
  });

  it('should reject missing signature', () => {
    const payload = JSON.stringify({ action: 'opened' });
    
    expect(verifyGitHubWebhook(payload, null, webhookSecret)).toBe(false);
  });

  it('should reject tampered payload', () => {
    const originalPayload = JSON.stringify({ action: 'opened', number: 1 });
    const signature = generateGitHubSignature(originalPayload, webhookSecret);
    const tamperedPayload = JSON.stringify({ action: 'opened', number: 999 });
    
    expect(verifyGitHubWebhook(tamperedPayload, signature, webhookSecret)).toBe(false);
  });

  it('should reject wrong secret', () => {
    const payload = JSON.stringify({ action: 'opened' });
    const signature = generateGitHubSignature(payload, webhookSecret);
    
    expect(verifyGitHubWebhook(payload, signature, 'wrong_secret')).toBe(false);
  });

  it('should handle malformed signature header', () => {
    const payload = JSON.stringify({ action: 'opened' });
    
    expect(verifyGitHubWebhook(payload, 'not_a_valid_format', webhookSecret)).toBe(false);
  });
});

describe('GitHub Signature Generation', () => {
  it('should generate sha256 prefixed signature', () => {
    const payload = '{"test":true}';
    const signature = generateGitHubSignature(payload, 'test_secret');
    
    expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it('should generate consistent signatures', () => {
    const payload = '{"action":"opened"}';
    const secret = 'test_secret';
    
    const sig1 = generateGitHubSignature(payload, secret);
    const sig2 = generateGitHubSignature(payload, secret);
    
    expect(sig1).toBe(sig2);
  });

  it('should generate different signatures for different payloads', () => {
    const secret = 'test_secret';
    
    const sig1 = generateGitHubSignature('{"id":1}', secret);
    const sig2 = generateGitHubSignature('{"id":2}', secret);
    
    expect(sig1).not.toBe(sig2);
  });
});
