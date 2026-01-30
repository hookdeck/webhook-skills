import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Set test environment variables
beforeAll(() => {
  process.env.SHOPIFY_API_SECRET = 'test_shopify_secret';
});

/**
 * Generate a valid Shopify HMAC signature for testing
 */
function generateShopifySignature(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('base64');
}

/**
 * Verify Shopify webhook signature (same logic as in route.ts)
 */
function verifyShopifyWebhook(body: string, hmacHeader: string, secret: string): boolean {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');
  
  try {
    return crypto.timingSafeEqual(
      Buffer.from(hash),
      Buffer.from(hmacHeader)
    );
  } catch {
    return false;
  }
}

describe('Shopify Signature Verification', () => {
  const apiSecret = 'test_shopify_secret';

  it('should validate correct signature', () => {
    const payload = JSON.stringify({ id: 123, email: 'test@example.com' });
    const signature = generateShopifySignature(payload, apiSecret);
    
    expect(verifyShopifyWebhook(payload, signature, apiSecret)).toBe(true);
  });

  it('should reject invalid signature', () => {
    const payload = JSON.stringify({ id: 123 });
    
    expect(verifyShopifyWebhook(payload, 'invalid_signature', apiSecret)).toBe(false);
  });

  it('should reject tampered payload', () => {
    const originalPayload = JSON.stringify({ id: 123, amount: 100 });
    const signature = generateShopifySignature(originalPayload, apiSecret);
    const tamperedPayload = JSON.stringify({ id: 123, amount: 999 });
    
    expect(verifyShopifyWebhook(tamperedPayload, signature, apiSecret)).toBe(false);
  });

  it('should reject wrong secret', () => {
    const payload = JSON.stringify({ id: 123 });
    const signature = generateShopifySignature(payload, apiSecret);
    
    expect(verifyShopifyWebhook(payload, signature, 'wrong_secret')).toBe(false);
  });

  it('should handle empty payload', () => {
    const payload = '';
    const signature = generateShopifySignature(payload, apiSecret);
    
    expect(verifyShopifyWebhook(payload, signature, apiSecret)).toBe(true);
  });
});

describe('Shopify Signature Generation', () => {
  it('should generate base64 encoded signature', () => {
    const payload = '{"test":true}';
    const signature = generateShopifySignature(payload, 'test_secret');
    
    // Base64 characters only
    expect(signature).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it('should generate consistent signatures', () => {
    const payload = '{"id":123}';
    const secret = 'test_secret';
    
    const sig1 = generateShopifySignature(payload, secret);
    const sig2 = generateShopifySignature(payload, secret);
    
    expect(sig1).toBe(sig2);
  });

  it('should generate different signatures for different payloads', () => {
    const secret = 'test_secret';
    
    const sig1 = generateShopifySignature('{"id":1}', secret);
    const sig2 = generateShopifySignature('{"id":2}', secret);
    
    expect(sig1).not.toBe(sig2);
  });
});
