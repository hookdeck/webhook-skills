import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { verifyCourierWebhook } from '../app/webhooks/courier/route';

beforeAll(() => {
  process.env.COURIER_WEBHOOK_SECRET = 'courier_test_secret';
});

const webhookSecret = 'courier_test_secret';

/**
 * Generate a valid Courier signature header for testing.
 * Signed content is `<timestamp>.<rawBody>`, HMAC-SHA256 hex.
 */
function generateCourierSignature(
  payload: string,
  secret: string,
  timestamp: number | string = Date.now()
): string {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  return `t=${timestamp},signature=${signature}`;
}

describe('verifyCourierWebhook', () => {
  it('accepts a valid signature', () => {
    const payload = JSON.stringify({ type: 'message:updated', data: { id: 'm1' } });
    const header = generateCourierSignature(payload, webhookSecret);
    expect(verifyCourierWebhook(payload, header, webhookSecret)).toBe(true);
  });

  it('rejects a null header', () => {
    expect(verifyCourierWebhook('{}', null, webhookSecret)).toBe(false);
  });

  it('rejects a malformed header', () => {
    expect(verifyCourierWebhook('{}', 'not-a-signature', webhookSecret)).toBe(false);
  });

  it('rejects an invalid signature', () => {
    const payload = JSON.stringify({ type: 'message:updated', data: {} });
    const header = `t=${Date.now()},signature=deadbeef`;
    expect(verifyCourierWebhook(payload, header, webhookSecret)).toBe(false);
  });

  it('rejects a tampered payload', () => {
    const original = JSON.stringify({ type: 'message:updated', data: { id: 'm1' } });
    const header = generateCourierSignature(original, webhookSecret);
    const tampered = JSON.stringify({ type: 'message:updated', data: { id: 'HACKED' } });
    expect(verifyCourierWebhook(tampered, header, webhookSecret)).toBe(false);
  });

  it('rejects a stale timestamp', () => {
    const payload = JSON.stringify({ type: 'message:updated', data: {} });
    const staleTs = Date.now() - 10 * 60 * 1000; // 10 minutes ago
    const header = generateCourierSignature(payload, webhookSecret, staleTs);
    expect(verifyCourierWebhook(payload, header, webhookSecret)).toBe(false);
  });

  it('accepts a seconds-precision timestamp (defensive; Courier documents milliseconds)', () => {
    const payload = JSON.stringify({ type: 'message:updated', data: { id: 'm1' } });
    const seconds = Math.floor(Date.now() / 1000);
    const header = generateCourierSignature(payload, webhookSecret, seconds);
    expect(verifyCourierWebhook(payload, header, webhookSecret)).toBe(true);
  });

  it('rejects a stale seconds-precision timestamp', () => {
    const payload = JSON.stringify({ type: 'message:updated', data: {} });
    const staleSeconds = Math.floor(Date.now() / 1000) - 10 * 60; // 10 minutes ago
    const header = generateCourierSignature(payload, webhookSecret, staleSeconds);
    expect(verifyCourierWebhook(payload, header, webhookSecret)).toBe(false);
  });

  it('rejects a non-numeric timestamp', () => {
    const payload = JSON.stringify({ type: 'message:updated', data: {} });
    const header = generateCourierSignature(payload, webhookSecret, 'not-a-timestamp');
    expect(verifyCourierWebhook(payload, header, webhookSecret)).toBe(false);
  });

  it("matches Courier's documented JSON.stringify(body) form for an unmodified body", () => {
    // Courier documents the signed content as `${t}.${JSON.stringify(body)}`;
    // this skill signs `${t}.${rawBody}`. For a delivery we have not modified
    // the two inputs are byte-identical, so both produce the same digest.
    const rawBody = JSON.stringify({
      type: 'message:updated',
      data: { id: 'm1', status: 'DELIVERED' },
    });
    const timestamp = Date.now();
    const docsDigest = crypto
      .createHmac('sha256', webhookSecret)
      .update(`${timestamp}.${JSON.stringify(JSON.parse(rawBody))}`)
      .digest('hex');
    expect(
      verifyCourierWebhook(rawBody, `t=${timestamp},signature=${docsDigest}`, webhookSecret)
    ).toBe(true);
  });

  it('accepts all Courier event types with a valid signature', () => {
    const eventTypes = [
      'message:updated',
      'notification:submitted',
      'notification:submission_canceled',
      'notification:published',
      'audiences:updated',
      'audiences:user:matched',
      'audiences:user:unmatched',
      'audiences:calculated',
    ];

    for (const type of eventTypes) {
      const payload = JSON.stringify({ type, data: { id: 'obj_123' } });
      const header = generateCourierSignature(payload, webhookSecret);
      expect(verifyCourierWebhook(payload, header, webhookSecret)).toBe(true);
    }
  });
});

describe('generateCourierSignature', () => {
  it('produces the documented header format', () => {
    const header = generateCourierSignature('{"test":true}', webhookSecret);
    expect(header).toMatch(/^t=\d+,signature=[a-f0-9]{64}$/);
  });
});
