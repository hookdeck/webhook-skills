import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

beforeAll(() => {
  process.env.INTERCOM_CLIENT_SECRET = 'test_intercom_client_secret';
});

/**
 * Verify Intercom webhook signature (mirror of the logic in route.ts).
 */
function verifyIntercomWebhook(
  rawBody: string,
  signatureHeader: string | null,
  clientSecret: string
): boolean {
  if (!signatureHeader || !clientSecret) {
    return false;
  }

  const [algorithm, signature] = signatureHeader.split('=');
  if (algorithm !== 'sha1' || !signature) {
    return false;
  }

  const expected = crypto
    .createHmac('sha1', clientSecret)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Generate a valid Intercom signature (sha1=<hex>) for testing.
 */
function generateIntercomSignature(payload: string, secret: string): string {
  const signature = crypto
    .createHmac('sha1', secret)
    .update(payload)
    .digest('hex');
  return `sha1=${signature}`;
}

describe('Intercom Signature Verification', () => {
  const clientSecret = 'test_intercom_client_secret';

  it('should validate correct signature', () => {
    const payload = JSON.stringify({ topic: 'ping', id: 'notif_1' });
    const signature = generateIntercomSignature(payload, clientSecret);

    expect(verifyIntercomWebhook(payload, signature, clientSecret)).toBe(true);
  });

  it('should reject invalid signature', () => {
    const payload = JSON.stringify({ topic: 'ping' });

    expect(verifyIntercomWebhook(payload, 'sha1=deadbeef', clientSecret)).toBe(false);
  });

  it('should reject missing signature', () => {
    const payload = JSON.stringify({ topic: 'ping' });

    expect(verifyIntercomWebhook(payload, null, clientSecret)).toBe(false);
  });

  it('should reject tampered payload', () => {
    const original = JSON.stringify({ topic: 'ping', id: 'a' });
    const tampered = JSON.stringify({ topic: 'ping', id: 'b' });
    const signature = generateIntercomSignature(original, clientSecret);

    expect(verifyIntercomWebhook(tampered, signature, clientSecret)).toBe(false);
  });

  it('should reject wrong secret', () => {
    const payload = JSON.stringify({ topic: 'ping' });
    const signature = generateIntercomSignature(payload, clientSecret);

    expect(verifyIntercomWebhook(payload, signature, 'wrong_secret')).toBe(false);
  });

  it('should reject wrong algorithm prefix', () => {
    const payload = JSON.stringify({ topic: 'ping' });
    const sig = crypto.createHmac('sha256', clientSecret).update(payload).digest('hex');

    expect(verifyIntercomWebhook(payload, `sha256=${sig}`, clientSecret)).toBe(false);
  });

  it('should reject malformed signature header', () => {
    const payload = JSON.stringify({ topic: 'ping' });

    expect(verifyIntercomWebhook(payload, 'not_a_valid_format', clientSecret)).toBe(false);
  });
});

describe('Intercom Signature Generation', () => {
  it('should generate sha1 prefixed signature with 40 hex chars', () => {
    const payload = '{"topic":"ping"}';
    const signature = generateIntercomSignature(payload, 'test_secret');

    expect(signature).toMatch(/^sha1=[a-f0-9]{40}$/);
  });

  it('should generate consistent signatures', () => {
    const payload = '{"topic":"ping"}';
    const secret = 'test_secret';

    const sig1 = generateIntercomSignature(payload, secret);
    const sig2 = generateIntercomSignature(payload, secret);

    expect(sig1).toBe(sig2);
  });

  it('should generate different signatures for different payloads', () => {
    const secret = 'test_secret';

    const sig1 = generateIntercomSignature('{"id":1}', secret);
    const sig2 = generateIntercomSignature('{"id":2}', secret);

    expect(sig1).not.toBe(sig2);
  });
});
