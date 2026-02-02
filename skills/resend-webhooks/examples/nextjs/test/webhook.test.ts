import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Set test environment variables
beforeAll(() => {
  process.env.RESEND_API_KEY = 're_test_fake_key';
  process.env.RESEND_WEBHOOK_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvcl90ZXN0aW5n';
});

/**
 * Generate a valid Svix signature for testing (used by Resend)
 */
function generateSvixSignature(
  payload: string,
  secret: string,
  msgId: string | null = null,
  timestamp: string | null = null
): { 'svix-id': string; 'svix-timestamp': string; 'svix-signature': string } {
  msgId = msgId || `msg_${crypto.randomBytes(16).toString('hex')}`;
  timestamp = timestamp || Math.floor(Date.now() / 1000).toString();
  
  // Remove 'whsec_' prefix and decode secret
  const secretKey = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const secretBytes = Buffer.from(secretKey, 'base64');
  
  // Create signed content
  const signedContent = `${msgId}.${timestamp}.${payload}`;
  
  // Compute signature
  const signature = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent)
    .digest('base64');
  
  return {
    'svix-id': msgId,
    'svix-timestamp': timestamp,
    'svix-signature': `v1,${signature}`
  };
}

/**
 * Parse Svix signature header
 */
function parseSvixSignature(header: string): { version: string; signature: string }[] {
  return header.split(' ').map(sig => {
    const [version, signature] = sig.split(',');
    return { version, signature };
  });
}

/**
 * Verify Svix signature (mirrors the logic in route.ts)
 */
function verifySvixSignature(
  payload: string,
  headers: { 'svix-id': string; 'svix-timestamp': string; 'svix-signature': string },
  secret: string,
  tolerance: number = 300
): boolean {
  const msgId = headers['svix-id'];
  const msgTimestamp = headers['svix-timestamp'];
  const msgSignature = headers['svix-signature'];

  if (!msgId || !msgTimestamp || !msgSignature) {
    return false;
  }

  // Check timestamp tolerance
  const now = Math.floor(Date.now() / 1000);
  const timestamp = parseInt(msgTimestamp, 10);
  if (Math.abs(now - timestamp) > tolerance) {
    return false;
  }

  // Remove 'whsec_' prefix and decode secret
  const secretKey = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const secretBytes = Buffer.from(secretKey, 'base64');

  // Create signed content
  const signedContent = `${msgId}.${msgTimestamp}.${payload}`;

  // Compute expected signature
  const expectedSig = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent)
    .digest('base64');

  // Check against provided signatures
  const signatures = parseSvixSignature(msgSignature);
  for (const sig of signatures) {
    if (sig.version === 'v1') {
      try {
        if (crypto.timingSafeEqual(
          Buffer.from(sig.signature),
          Buffer.from(expectedSig)
        )) {
          return true;
        }
      } catch {
        // Length mismatch, continue checking
      }
    }
  }

  return false;
}

describe('Svix Signature Verification', () => {
  const webhookSecret = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvcl90ZXN0aW5n';

  it('should validate correct signature', () => {
    const payload = JSON.stringify({
      type: 'email.sent',
      created_at: new Date().toISOString(),
      data: { email_id: 'test_email_123' }
    });
    const headers = generateSvixSignature(payload, webhookSecret);
    
    expect(verifySvixSignature(payload, headers, webhookSecret)).toBe(true);
  });

  it('should reject invalid signature', () => {
    const payload = JSON.stringify({
      type: 'email.sent',
      data: { email_id: 'test_email_123' }
    });
    
    const headers = {
      'svix-id': 'msg_test123',
      'svix-timestamp': Math.floor(Date.now() / 1000).toString(),
      'svix-signature': 'v1,invalid_signature'
    };
    
    expect(verifySvixSignature(payload, headers, webhookSecret)).toBe(false);
  });

  it('should reject missing headers', () => {
    const payload = JSON.stringify({ type: 'email.sent' });
    
    const headers = {
      'svix-id': '',
      'svix-timestamp': '',
      'svix-signature': ''
    };
    
    expect(verifySvixSignature(payload, headers, webhookSecret)).toBe(false);
  });

  it('should reject tampered payload', () => {
    const originalPayload = JSON.stringify({
      type: 'email.sent',
      data: { email_id: 'original_id' }
    });
    const headers = generateSvixSignature(originalPayload, webhookSecret);
    const tamperedPayload = JSON.stringify({
      type: 'email.sent',
      data: { email_id: 'tampered_id' }
    });
    
    expect(verifySvixSignature(tamperedPayload, headers, webhookSecret)).toBe(false);
  });

  it('should reject old timestamps', () => {
    const payload = JSON.stringify({ type: 'email.sent' });
    const oldTimestamp = (Math.floor(Date.now() / 1000) - 400).toString();
    const headers = generateSvixSignature(payload, webhookSecret, null, oldTimestamp);
    
    expect(verifySvixSignature(payload, headers, webhookSecret)).toBe(false);
  });
});

describe('Svix Signature Generation', () => {
  it('should generate valid format', () => {
    const payload = '{"test":true}';
    const headers = generateSvixSignature(payload, 'whsec_dGVzdF9zZWNyZXQ=');
    
    expect(headers['svix-id']).toMatch(/^msg_[a-f0-9]{32}$/);
    expect(headers['svix-timestamp']).toMatch(/^\d+$/);
    expect(headers['svix-signature']).toMatch(/^v1,[A-Za-z0-9+/]+=*$/);
  });

  it('should include current timestamp', () => {
    const payload = '{"test":true}';
    const before = Math.floor(Date.now() / 1000);
    const headers = generateSvixSignature(payload, 'whsec_dGVzdF9zZWNyZXQ=');
    const after = Math.floor(Date.now() / 1000);
    
    const timestamp = parseInt(headers['svix-timestamp']);
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });
});
