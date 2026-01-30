import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Set test environment variables
beforeAll(() => {
  process.env.HOOKDECK_WEBHOOK_SECRET = 'test_hookdeck_secret';
});

/**
 * Generate a valid Hookdeck signature for testing (base64 HMAC SHA-256)
 */
function generateHookdeckSignature(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64');
}

/**
 * Verify Hookdeck webhook signature (same logic as in route.ts)
 */
function verifyHookdeckSignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) {
    return false;
  }

  const hash = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(hash)
    );
  } catch {
    return false;
  }
}

describe('Hookdeck Signature Verification', () => {
  const webhookSecret = 'test_hookdeck_secret';

  it('should validate correct signature', () => {
    const payload = JSON.stringify({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_123' } }
    });
    const signature = generateHookdeckSignature(payload, webhookSecret);
    
    expect(verifyHookdeckSignature(payload, signature, webhookSecret)).toBe(true);
  });

  it('should reject invalid signature', () => {
    const payload = JSON.stringify({ type: 'test' });
    
    expect(verifyHookdeckSignature(payload, 'invalid_signature', webhookSecret)).toBe(false);
  });

  it('should reject missing signature', () => {
    const payload = JSON.stringify({ type: 'test' });
    
    expect(verifyHookdeckSignature(payload, null, webhookSecret)).toBe(false);
  });

  it('should reject missing secret', () => {
    const payload = JSON.stringify({ type: 'test' });
    const signature = generateHookdeckSignature(payload, webhookSecret);
    
    expect(verifyHookdeckSignature(payload, signature, '')).toBe(false);
  });

  it('should reject tampered payload', () => {
    const originalPayload = JSON.stringify({ type: 'test', amount: 100 });
    const signature = generateHookdeckSignature(originalPayload, webhookSecret);
    const tamperedPayload = JSON.stringify({ type: 'test', amount: 999 });
    
    expect(verifyHookdeckSignature(tamperedPayload, signature, webhookSecret)).toBe(false);
  });

  it('should reject wrong secret', () => {
    const payload = JSON.stringify({ type: 'test' });
    const signature = generateHookdeckSignature(payload, webhookSecret);
    
    expect(verifyHookdeckSignature(payload, signature, 'wrong_secret')).toBe(false);
  });
});

describe('Hookdeck Signature Generation', () => {
  it('should generate base64 encoded signature', () => {
    const payload = '{"test":true}';
    const signature = generateHookdeckSignature(payload, 'test_secret');
    
    // Base64 characters only
    expect(signature).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it('should generate consistent signatures', () => {
    const payload = '{"type":"test"}';
    const secret = 'test_secret';
    
    const sig1 = generateHookdeckSignature(payload, secret);
    const sig2 = generateHookdeckSignature(payload, secret);
    
    expect(sig1).toBe(sig2);
  });

  it('should generate different signatures for different payloads', () => {
    const secret = 'test_secret';
    
    const sig1 = generateHookdeckSignature('{"id":1}', secret);
    const sig2 = generateHookdeckSignature('{"id":2}', secret);
    
    expect(sig1).not.toBe(sig2);
  });
});
