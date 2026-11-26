import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import crypto from 'crypto';

const WEBHOOK_SECRET = 'test_fireflies_secret_1234';

// Set test environment variables before the route reads them
beforeAll(() => {
  process.env.FIREFLIES_WEBHOOK_SECRET = WEBHOOK_SECRET;
});

afterEach(() => {
  process.env.FIREFLIES_WEBHOOK_SECRET = WEBHOOK_SECRET;
  vi.restoreAllMocks();
});

import { POST, verifyFirefliesWebhook } from '../app/webhooks/fireflies/route';
import { NextRequest } from 'next/server';

/**
 * Generate a valid Fireflies Webhooks V2 signature for testing.
 * HMAC-SHA256 over the raw body, hex-encoded, with the `sha256=` prefix.
 */
function generateFirefliesSignature(payload: string, secret: string): string {
  const hex = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return `sha256=${hex}`;
}

/** Build a NextRequest for the webhook route. */
function buildRequest(body: string, signature?: string | null): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (signature) {
    headers['x-hub-signature'] = signature;
  }

  return new NextRequest('http://localhost/webhooks/fireflies', {
    method: 'POST',
    headers,
    body,
  });
}

describe('Fireflies Signature Verification (V2)', () => {
  it('should validate correct signature', () => {
    const payload = JSON.stringify({
      event: 'meeting.transcribed',
      timestamp: 1710876543210,
      meeting_id: 'ASxwZxCstx',
    });
    const signature = generateFirefliesSignature(payload, WEBHOOK_SECRET);

    expect(verifyFirefliesWebhook(payload, signature, WEBHOOK_SECRET)).toBe(true);
  });

  it('should reject invalid signature', () => {
    const payload = JSON.stringify({ meeting_id: 'abc' });

    expect(verifyFirefliesWebhook(payload, 'sha256=deadbeef', WEBHOOK_SECRET)).toBe(false);
  });

  it('should reject missing signature', () => {
    const payload = JSON.stringify({ meeting_id: 'abc' });

    expect(verifyFirefliesWebhook(payload, null, WEBHOOK_SECRET)).toBe(false);
  });

  it('should reject tampered payload', () => {
    const originalPayload = JSON.stringify({ meeting_id: 'abc' });
    const signature = generateFirefliesSignature(originalPayload, WEBHOOK_SECRET);
    const tamperedPayload = JSON.stringify({ meeting_id: 'xyz' });

    expect(verifyFirefliesWebhook(tamperedPayload, signature, WEBHOOK_SECRET)).toBe(false);
  });

  it('should reject wrong secret', () => {
    const payload = JSON.stringify({ meeting_id: 'abc' });
    const signature = generateFirefliesSignature(payload, WEBHOOK_SECRET);

    expect(verifyFirefliesWebhook(payload, signature, 'wrong_secret')).toBe(false);
  });

  it('should reject a bare hex digest with no sha256= prefix', () => {
    const payload = JSON.stringify({ meeting_id: 'abc' });
    const bareHex = crypto.createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex');

    expect(verifyFirefliesWebhook(payload, bareHex, WEBHOOK_SECRET)).toBe(false);
  });

  it('should reject a malformed prefix', () => {
    const payload = JSON.stringify({ meeting_id: 'abc' });
    const hex = crypto.createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex');

    expect(verifyFirefliesWebhook(payload, `sha1=${hex}`, WEBHOOK_SECRET)).toBe(false);
    expect(verifyFirefliesWebhook(payload, `sha256:${hex}`, WEBHOOK_SECRET)).toBe(false);
  });

  it('should reject when no secret is configured', () => {
    const payload = JSON.stringify({ meeting_id: 'abc' });
    const signature = generateFirefliesSignature(payload, WEBHOOK_SECRET);

    expect(verifyFirefliesWebhook(payload, signature, undefined)).toBe(false);
  });
});

describe('POST /webhooks/fireflies', () => {
  it('should return 401 for missing signature', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const payload = JSON.stringify({ event: 'meeting.transcribed', meeting_id: 'abc' });

    const response = await POST(buildRequest(payload));

    expect(response.status).toBe(401);
  });

  it('should return 401 for invalid signature', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const payload = JSON.stringify({ event: 'meeting.transcribed', meeting_id: 'abc' });

    const response = await POST(buildRequest(payload, 'sha256=deadbeef'));

    expect(response.status).toBe(401);
  });

  it('should return 401 for a tampered body', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const original = JSON.stringify({ event: 'meeting.transcribed', meeting_id: 'abc' });
    const signature = generateFirefliesSignature(original, WEBHOOK_SECRET);
    const tampered = JSON.stringify({ event: 'meeting.transcribed', meeting_id: 'xyz' });

    const response = await POST(buildRequest(tampered, signature));

    expect(response.status).toBe(401);
  });

  it('should return 401 when the sha256= prefix is missing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const payload = JSON.stringify({ event: 'meeting.transcribed', meeting_id: 'abc' });
    const bareHex = crypto.createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex');

    const response = await POST(buildRequest(payload, bareHex));

    expect(response.status).toBe(401);
  });

  it('should return 200 for a valid signature', async () => {
    const payload = JSON.stringify({
      event: 'meeting.transcribed',
      timestamp: 1710876543210,
      meeting_id: 'ASxwZxCstx',
      client_reference_id: 'be582c46-4ac9-4565-9ba6-6ab4264496a8',
    });
    const signature = generateFirefliesSignature(payload, WEBHOOK_SECRET);

    const response = await POST(buildRequest(payload, signature));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
  });

  it.each([
    'meeting.transcribed',
    'meeting.summarized',
    'meeting.bot_joined',
  ])('should dispatch the %s event', async (event) => {
    const payload = JSON.stringify({
      event,
      timestamp: 1710876543210,
      meeting_id: 'ASxwZxCstx',
    });
    const signature = generateFirefliesSignature(payload, WEBHOOK_SECRET);

    const response = await POST(buildRequest(payload, signature));

    expect(response.status).toBe(200);
  });

  it('should acknowledge unknown event types with 200', async () => {
    const payload = JSON.stringify({
      event: 'meeting.some_future_event',
      timestamp: 1710876543210,
      meeting_id: 'ASxwZxCstx',
    });
    const signature = generateFirefliesSignature(payload, WEBHOOK_SECRET);

    const response = await POST(buildRequest(payload, signature));

    expect(response.status).toBe(200);
  });

  it('should accept an unsigned delivery and warn when no secret is configured', async () => {
    // Fireflies omits X-Hub-Signature entirely when no signing secret is set at
    // webhook setup. This example accepts those deliveries with a warning.
    delete process.env.FIREFLIES_WEBHOOK_SECRET;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const payload = JSON.stringify({
      event: 'meeting.transcribed',
      timestamp: 1710876543210,
      meeting_id: 'ASxwZxCstx',
    });

    const response = await POST(buildRequest(payload));

    expect(response.status).toBe(200);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('UNVERIFIED'));
  });
});

describe('Fireflies Signature Generation', () => {
  it('should generate a sha256= prefixed hex signature', () => {
    const payload = '{"test":true}';
    const signature = generateFirefliesSignature(payload, 'test_secret');

    expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it('should generate consistent signatures', () => {
    const payload = '{"meeting_id":"abc"}';
    const secret = 'test_secret';

    const sig1 = generateFirefliesSignature(payload, secret);
    const sig2 = generateFirefliesSignature(payload, secret);

    expect(sig1).toBe(sig2);
  });

  it('should generate different signatures for different payloads', () => {
    const secret = 'test_secret';

    const sig1 = generateFirefliesSignature('{"meeting_id":"a"}', secret);
    const sig2 = generateFirefliesSignature('{"meeting_id":"b"}', secret);

    expect(sig1).not.toBe(sig2);
  });
});
