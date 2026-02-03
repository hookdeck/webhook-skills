import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// Mock environment variables
vi.stubEnv('PADDLE_WEBHOOK_SECRET', 'test_secret_key');

/**
 * Generate a valid Paddle signature for testing
 */
function generatePaddleSignature(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}:${payload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  return `ts=${timestamp};h1=${signature}`;
}

/**
 * Verify Paddle webhook signature (copy of route implementation for testing)
 */
function verifyPaddleSignature(
  payload: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) {
    return false;
  }

  try {
    const parts = signatureHeader.split(';');
    const timestamp = parts.find(p => p.startsWith('ts='))?.slice(3);
    const signatures = parts
      .filter(p => p.startsWith('h1='))
      .map(p => p.slice(3));

    if (!timestamp || signatures.length === 0) {
      return false;
    }

    const signedPayload = `${timestamp}:${payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');

    return signatures.some(sig => {
      try {
        return crypto.timingSafeEqual(
          Buffer.from(sig),
          Buffer.from(expectedSignature)
        );
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

describe('Paddle Webhook Signature Verification', () => {
  const webhookSecret = 'test_secret_key';

  it('should return true for valid signature', () => {
    const payload = '{"event_type":"test"}';
    const signature = generatePaddleSignature(payload, webhookSecret);
    
    expect(verifyPaddleSignature(payload, signature, webhookSecret)).toBe(true);
  });

  it('should return false for invalid signature', () => {
    const payload = '{"event_type":"test"}';
    const signature = 'ts=123;h1=invalid_signature';
    
    expect(verifyPaddleSignature(payload, signature, webhookSecret)).toBe(false);
  });

  it('should return false for missing signature header', () => {
    const payload = '{"event_type":"test"}';
    
    expect(verifyPaddleSignature(payload, null, webhookSecret)).toBe(false);
  });

  it('should return false for malformed signature header', () => {
    const payload = '{"event_type":"test"}';
    
    expect(verifyPaddleSignature(payload, 'invalid', webhookSecret)).toBe(false);
    expect(verifyPaddleSignature(payload, 'ts=123', webhookSecret)).toBe(false);
  });

  it('should return false for tampered payload', () => {
    const originalPayload = '{"event_type":"test","data":{"id":"123"}}';
    const tamperedPayload = '{"event_type":"test","data":{"id":"456"}}';
    const signature = generatePaddleSignature(originalPayload, webhookSecret);
    
    expect(verifyPaddleSignature(tamperedPayload, signature, webhookSecret)).toBe(false);
  });

  it('should handle multiple h1 signatures (rotation)', () => {
    const payload = '{"event_type":"test"}';
    const timestamp = Math.floor(Date.now() / 1000);
    const signedPayload = `${timestamp}:${payload}`;
    
    const validSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(signedPayload)
      .digest('hex');
    
    // Include an old invalid signature and a new valid one
    const signature = `ts=${timestamp};h1=old_invalid_signature;h1=${validSignature}`;
    
    expect(verifyPaddleSignature(payload, signature, webhookSecret)).toBe(true);
  });
});
