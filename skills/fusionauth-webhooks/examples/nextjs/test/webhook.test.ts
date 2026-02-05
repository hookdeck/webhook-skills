import { describe, it, expect, beforeAll } from 'vitest';
import { createHash } from 'crypto';
import { SignJWT } from 'jose';

// Set test environment variables
const TEST_SECRET = 'test_webhook_secret_for_hmac_signing';

beforeAll(() => {
  process.env.FUSIONAUTH_WEBHOOK_SECRET = TEST_SECRET;
});

/**
 * Generate a valid FusionAuth signature JWT for testing
 * FusionAuth signs webhooks with a JWT containing request_body_sha256 claim
 */
async function generateFusionAuthSignature(payload: string, secret: string): Promise<string> {
  // Calculate SHA-256 hash of body (base64 encoded)
  const bodyHash = createHash('sha256')
    .update(payload)
    .digest('base64');

  // Create signing key from secret
  const key = new TextEncoder().encode(secret);

  // Sign JWT with body hash claim
  const jwt = await new SignJWT({ request_body_sha256: bodyHash })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .sign(key);

  return jwt;
}

/**
 * Verify FusionAuth webhook signature (same logic as in route.ts)
 */
async function verifyFusionAuthWebhook(
  rawBody: string,
  signatureJwt: string | null,
  hmacSecret: string
): Promise<boolean> {
  if (!signatureJwt || !hmacSecret) return false;

  try {
    const { jwtVerify } = await import('jose');
    
    // Create key from HMAC secret
    const key = new TextEncoder().encode(hmacSecret);

    // Verify JWT signature and decode
    const { payload } = await jwtVerify(signatureJwt, key, {
      algorithms: ['HS256', 'HS384', 'HS512']
    });

    // Calculate SHA-256 hash of request body
    const bodyHash = createHash('sha256')
      .update(rawBody)
      .digest('base64');

    // Compare hash from JWT claim with calculated hash
    return payload.request_body_sha256 === bodyHash;
  } catch {
    return false;
  }
}

describe('FusionAuth Signature Verification', () => {
  const webhookSecret = TEST_SECRET;

  it('should validate correct signature', async () => {
    const payload = JSON.stringify({
      event: {
        id: 'evt_test',
        type: 'user.create',
        user: { id: 'user_123' }
      }
    });
    const signature = await generateFusionAuthSignature(payload, webhookSecret);
    
    const isValid = await verifyFusionAuthWebhook(payload, signature, webhookSecret);
    expect(isValid).toBe(true);
  });

  it('should reject invalid signature', async () => {
    const payload = JSON.stringify({
      event: {
        id: 'evt_test',
        type: 'user.create'
      }
    });
    
    const isValid = await verifyFusionAuthWebhook(payload, 'invalid.jwt.token', webhookSecret);
    expect(isValid).toBe(false);
  });

  it('should reject missing signature', async () => {
    const payload = JSON.stringify({ event: { id: 'evt_test' } });
    
    const isValid = await verifyFusionAuthWebhook(payload, null, webhookSecret);
    expect(isValid).toBe(false);
  });

  it('should reject tampered payload', async () => {
    const originalPayload = JSON.stringify({
      event: {
        id: 'evt_test',
        type: 'user.create',
        user: { id: 'user_123' }
      }
    });
    const signature = await generateFusionAuthSignature(originalPayload, webhookSecret);
    const tamperedPayload = JSON.stringify({
      event: {
        id: 'evt_test',
        type: 'user.create',
        user: { id: 'user_tampered' }
      }
    });
    
    const isValid = await verifyFusionAuthWebhook(tamperedPayload, signature, webhookSecret);
    expect(isValid).toBe(false);
  });

  it('should reject wrong secret', async () => {
    const payload = JSON.stringify({
      event: {
        id: 'evt_test',
        type: 'user.create'
      }
    });
    const signature = await generateFusionAuthSignature(payload, webhookSecret);
    
    const isValid = await verifyFusionAuthWebhook(payload, signature, 'wrong_secret');
    expect(isValid).toBe(false);
  });
});

describe('FusionAuth Signature Generation', () => {
  it('should generate valid JWT format', async () => {
    const payload = '{"test":true}';
    const signature = await generateFusionAuthSignature(payload, TEST_SECRET);
    
    // JWT should have 3 parts separated by dots
    const parts = signature.split('.');
    expect(parts.length).toBe(3);
  });

  it('should include correct body hash', async () => {
    const payload = '{"test":true}';
    const signature = await generateFusionAuthSignature(payload, TEST_SECRET);
    
    // Decode payload (middle part)
    const payloadJson = JSON.parse(
      Buffer.from(signature.split('.')[1], 'base64url').toString()
    );
    
    // Verify hash is present
    expect(payloadJson.request_body_sha256).toBeDefined();
    
    // Verify hash matches
    const expectedHash = createHash('sha256').update(payload).digest('base64');
    expect(payloadJson.request_body_sha256).toBe(expectedHash);
  });

  it('should include HS256 algorithm in header', async () => {
    const payload = '{"test":true}';
    const signature = await generateFusionAuthSignature(payload, TEST_SECRET);
    
    // Decode header (first part)
    const header = JSON.parse(
      Buffer.from(signature.split('.')[0], 'base64url').toString()
    );
    
    expect(header.alg).toBe('HS256');
    expect(header.typ).toBe('JWT');
  });
});

describe('Event Type Handling', () => {
  const eventTypes = [
    'user.create',
    'user.update',
    'user.delete',
    'user.deactivate',
    'user.reactivate',
    'user.login.success',
    'user.login.failed',
    'user.registration.create',
    'user.registration.update',
    'user.registration.delete',
    'user.email.verified'
  ];

  it.each(eventTypes)('should generate valid signature for %s event', async (eventType) => {
    const payload = JSON.stringify({
      event: {
        id: `evt_${eventType.replace(/\./g, '_')}`,
        type: eventType,
        user: { id: 'user_123', email: 'test@example.com' },
        applicationId: 'app_123'
      }
    });
    const signature = await generateFusionAuthSignature(payload, TEST_SECRET);
    
    const isValid = await verifyFusionAuthWebhook(payload, signature, TEST_SECRET);
    expect(isValid).toBe(true);
  });
});
