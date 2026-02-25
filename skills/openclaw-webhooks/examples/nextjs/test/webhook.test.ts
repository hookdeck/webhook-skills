import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

const VALID_TOKEN = 'test-secret-token';

function extractToken(
  authHeader: string | null,
  xTokenHeader: string | null
): string | null {
  if (xTokenHeader) return xTokenHeader;
  if (authHeader && authHeader.startsWith('Bearer '))
    return authHeader.slice(7);
  return null;
}

function verifyOpenClawWebhook(
  authHeader: string | null,
  xTokenHeader: string | null,
  secret: string
): boolean {
  const token = extractToken(authHeader, xTokenHeader);
  if (!token || !secret) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(secret));
  } catch {
    return false;
  }
}

describe('OpenClaw Token Verification', () => {
  it('should verify valid Bearer token', () => {
    expect(
      verifyOpenClawWebhook(`Bearer ${VALID_TOKEN}`, null, VALID_TOKEN)
    ).toBe(true);
  });

  it('should verify valid x-openclaw-token', () => {
    expect(
      verifyOpenClawWebhook(null, VALID_TOKEN, VALID_TOKEN)
    ).toBe(true);
  });

  it('should prefer x-openclaw-token over Authorization', () => {
    expect(
      verifyOpenClawWebhook('Bearer wrong', VALID_TOKEN, VALID_TOKEN)
    ).toBe(true);
  });

  it('should reject invalid token', () => {
    expect(
      verifyOpenClawWebhook('Bearer wrong-token', null, VALID_TOKEN)
    ).toBe(false);
  });

  it('should reject missing headers', () => {
    expect(
      verifyOpenClawWebhook(null, null, VALID_TOKEN)
    ).toBe(false);
  });

  it('should reject empty secret', () => {
    expect(
      verifyOpenClawWebhook(`Bearer ${VALID_TOKEN}`, null, '')
    ).toBe(false);
  });

  it('should handle different length tokens gracefully', () => {
    expect(
      verifyOpenClawWebhook('Bearer short', null, VALID_TOKEN)
    ).toBe(false);
  });
});
