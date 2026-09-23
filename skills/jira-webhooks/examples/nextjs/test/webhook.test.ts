import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST, verifyJiraWebhook } from '../app/webhooks/jira/route';

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

// Official test vector from Atlassian's "Secure admin webhooks" docs:
// https://developer.atlassian.com/cloud/jira/platform/webhooks/#secure-admin-webhooks
const VECTOR_SECRET = "It's a Secret to Everybody";
const VECTOR_PAYLOAD = 'Hello World!';
const VECTOR_SIGNATURE = 'sha256=a4771c39fbe90f317c7824e83ddef3caae9cb3d976c214ace1f2937e133263c9';

describe('Jira Signature Verification', () => {
  const webhookSecret = 'test_jira_secret';

  it('should pass the official Atlassian test vector', () => {
    expect(verifyJiraWebhook(VECTOR_PAYLOAD, VECTOR_SIGNATURE, VECTOR_SECRET)).toBe(true);
    expect(verifyJiraWebhook(VECTOR_PAYLOAD, VECTOR_SIGNATURE, 'wrong secret')).toBe(false);
  });

  it('should reject a method other than sha256', () => {
    const hex = VECTOR_SIGNATURE.slice('sha256='.length);
    expect(verifyJiraWebhook(VECTOR_PAYLOAD, `sha512=${hex}`, VECTOR_SECRET)).toBe(false);
  });

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

describe('POST /webhooks/jira route', () => {
  function makeRequest(body: string, signature?: string): NextRequest {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (signature) headers['x-hub-signature'] = signature;
    return new NextRequest('http://localhost/webhooks/jira', { method: 'POST', body, headers });
  }

  it('should return 401 when X-Hub-Signature is missing', async () => {
    process.env.JIRA_WEBHOOK_SECRET = 'test_jira_secret';
    const res = await POST(makeRequest('{"webhookEvent":"jira:issue_created"}'));
    expect(res.status).toBe(401);
  });

  it('should return 200 for a valid signed event', async () => {
    process.env.JIRA_WEBHOOK_SECRET = 'test_jira_secret';
    const body = JSON.stringify({
      webhookEvent: 'jira:issue_created',
      issue: { key: 'PROJ-1', fields: { summary: 'Test' } }
    });
    const res = await POST(makeRequest(body, generateJiraSignature(body, 'test_jira_secret')));
    expect(res.status).toBe(200);
  });
});
