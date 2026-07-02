import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Set test environment variables
beforeAll(() => {
  process.env.JIRA_WEBHOOK_SECRET = 'test_jira_secret';
});

/**
 * Generate a valid Jira signature for testing.
 * Mirrors Jira Cloud: HMAC-SHA256 over the raw body, hex, `sha256=` prefix.
 */
function generateJiraSignature(payload: string, secret: string): string {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return `sha256=${signature}`;
}

/**
 * Verify Jira webhook signature (same logic as in route.ts).
 */
function verifyJiraWebhook(body: string, signatureHeader: string | null, secret: string): boolean {
  const [method, sig] = (signatureHeader || '').split('=');
  if (method !== 'sha256' || !sig) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(sig, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

describe('Jira Signature Verification', () => {
  const webhookSecret = 'test_jira_secret';

  it('should validate correct signature', () => {
    const payload = JSON.stringify({
      webhookEvent: 'jira:issue_created',
      issue: { key: 'PROJ-123' }
    });
    const signature = generateJiraSignature(payload, webhookSecret);

    expect(verifyJiraWebhook(payload, signature, webhookSecret)).toBe(true);
  });

  it('should reject invalid signature', () => {
    const payload = JSON.stringify({ webhookEvent: 'jira:issue_created' });

    expect(verifyJiraWebhook(payload, 'sha256=invalid', webhookSecret)).toBe(false);
  });

  it('should reject missing signature', () => {
    const payload = JSON.stringify({ webhookEvent: 'jira:issue_created' });

    expect(verifyJiraWebhook(payload, null, webhookSecret)).toBe(false);
  });

  it('should reject tampered payload', () => {
    const original = JSON.stringify({ webhookEvent: 'jira:issue_created', key: 'PROJ-1' });
    const signature = generateJiraSignature(original, webhookSecret);
    const tampered = JSON.stringify({ webhookEvent: 'jira:issue_created', key: 'PROJ-999' });

    expect(verifyJiraWebhook(tampered, signature, webhookSecret)).toBe(false);
  });

  it('should reject wrong secret', () => {
    const payload = JSON.stringify({ webhookEvent: 'jira:issue_created' });
    const signature = generateJiraSignature(payload, webhookSecret);

    expect(verifyJiraWebhook(payload, signature, 'wrong_secret')).toBe(false);
  });

  it('should reject a header with no method prefix', () => {
    const payload = JSON.stringify({ webhookEvent: 'jira:issue_created' });
    const bareHex = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');

    expect(verifyJiraWebhook(payload, bareHex, webhookSecret)).toBe(false);
  });
});

describe('Jira Signature Generation', () => {
  it('should generate sha256 prefixed signature', () => {
    const payload = '{"test":true}';
    const signature = generateJiraSignature(payload, 'test_secret');

    expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it('should generate consistent signatures', () => {
    const payload = '{"webhookEvent":"jira:issue_created"}';
    const secret = 'test_secret';

    const sig1 = generateJiraSignature(payload, secret);
    const sig2 = generateJiraSignature(payload, secret);

    expect(sig1).toBe(sig2);
  });

  it('should generate different signatures for different payloads', () => {
    const secret = 'test_secret';

    const sig1 = generateJiraSignature('{"key":"PROJ-1"}', secret);
    const sig2 = generateJiraSignature('{"key":"PROJ-2"}', secret);

    expect(sig1).not.toBe(sig2);
  });
});
