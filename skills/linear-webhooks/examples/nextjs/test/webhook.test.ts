import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

beforeAll(() => {
  process.env.LINEAR_WEBHOOK_SECRET = 'test_linear_secret';
});

const webhookSecret = 'test_linear_secret';

/**
 * Generate a valid Linear-Signature header value.
 * Mirrors how Linear signs webhooks: hex-encoded HMAC-SHA256 of the raw body,
 * no `sha256=` prefix.
 */
function generateLinearSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Same verification logic as in `app/webhooks/linear/route.ts`. Duplicated
 * here so the unit tests do not depend on Next.js' server runtime.
 */
function verifyLinearWebhook(
  body: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

function isFreshTimestamp(
  webhookTimestamp: unknown,
  now: number = Date.now()
): boolean {
  if (typeof webhookTimestamp !== 'number') {
    return false;
  }
  return Math.abs(now - webhookTimestamp) <= 60 * 1000;
}

function buildPayload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    action: 'create',
    type: 'Issue',
    createdAt: new Date().toISOString(),
    data: { id: 'issue-1', title: 'Test issue' },
    webhookId: 'webhook-uuid',
    webhookTimestamp: Date.now(),
    organizationId: 'org-uuid',
    ...overrides,
  });
}

describe('Linear Signature Verification', () => {
  it('validates a correct signature', () => {
    const payload = buildPayload();
    const signature = generateLinearSignature(payload, webhookSecret);

    expect(verifyLinearWebhook(payload, signature, webhookSecret)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    const payload = buildPayload();

    expect(verifyLinearWebhook(payload, 'a'.repeat(64), webhookSecret)).toBe(false);
  });

  it('rejects a missing signature header', () => {
    const payload = buildPayload();

    expect(verifyLinearWebhook(payload, null, webhookSecret)).toBe(false);
  });

  it('rejects a tampered payload', () => {
    const original = buildPayload({ data: { id: 'issue-1', title: 'Original' } });
    const signature = generateLinearSignature(original, webhookSecret);
    const tampered = buildPayload({ data: { id: 'issue-1', title: 'Tampered' } });

    expect(verifyLinearWebhook(tampered, signature, webhookSecret)).toBe(false);
  });

  it('rejects the wrong secret', () => {
    const payload = buildPayload();
    const signature = generateLinearSignature(payload, webhookSecret);

    expect(verifyLinearWebhook(payload, signature, 'wrong_secret')).toBe(false);
  });

  it('rejects a malformed (non-hex) signature header', () => {
    const payload = buildPayload();

    expect(verifyLinearWebhook(payload, 'not a hex string', webhookSecret)).toBe(false);
  });
});

describe('Linear Signature Format', () => {
  it('produces a 64-character hex string with no sha256= prefix', () => {
    const signature = generateLinearSignature('{"test":true}', 'test_secret');

    expect(signature).toMatch(/^[a-f0-9]{64}$/);
    expect(signature.startsWith('sha256=')).toBe(false);
  });

  it('produces a consistent signature for the same input', () => {
    const sig1 = generateLinearSignature('{"action":"create"}', 'test_secret');
    const sig2 = generateLinearSignature('{"action":"create"}', 'test_secret');

    expect(sig1).toBe(sig2);
  });

  it('produces different signatures for different payloads', () => {
    const sig1 = generateLinearSignature('{"id":1}', 'test_secret');
    const sig2 = generateLinearSignature('{"id":2}', 'test_secret');

    expect(sig1).not.toBe(sig2);
  });
});

describe('webhookTimestamp freshness', () => {
  it('accepts a timestamp within the 1 minute tolerance', () => {
    expect(isFreshTimestamp(Date.now())).toBe(true);
    expect(isFreshTimestamp(Date.now() - 30_000)).toBe(true);
  });

  it('rejects a timestamp older than 1 minute', () => {
    expect(isFreshTimestamp(Date.now() - 5 * 60_000)).toBe(false);
  });

  it('rejects a timestamp in the far future', () => {
    expect(isFreshTimestamp(Date.now() + 5 * 60_000)).toBe(false);
  });

  it('rejects non-numeric values', () => {
    expect(isFreshTimestamp(undefined)).toBe(false);
    expect(isFreshTimestamp('123')).toBe(false);
  });
});
