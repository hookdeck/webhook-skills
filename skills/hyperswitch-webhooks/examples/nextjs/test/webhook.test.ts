import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/hyperswitch/route';
import {
  KNOWN_EVENT_TYPES,
  processedEventIds,
  verifyHyperswitchSignature,
} from '../lib/hyperswitch';

// payment_response_hash_key is used as UTF-8 bytes (not hex- or base64-decoded).
const SECRET = 'hyperswitch_test_payment_response_hash_key';
process.env.HYPERSWITCH_WEBHOOK_SECRET = SECRET;

// Sign the way Hyperswitch does: HMAC-SHA512 over the raw body, lowercase hex, no prefix.
function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha512', secret).update(body).digest('hex');
}

function build(
  body: string,
  signature: string | null = sign(body),
  contentType = 'application/json'
): NextRequest {
  const headers = new Headers({ 'content-type': contentType });
  if (signature !== null) headers.set('x-webhook-signature-512', signature);
  return new NextRequest('http://localhost/webhooks/hyperswitch', {
    method: 'POST',
    headers,
    body,
  });
}

function eventBody(eventType: string, eventId = `evt_${eventType}`): string {
  return JSON.stringify({
    merchant_id: 'merchant_1',
    event_id: eventId,
    event_type: eventType,
    content: { type: 'payment_details', object: { payment_id: 'pay_123' } },
    timestamp: '2026-10-26T10:00:00.000Z',
  });
}

describe('Hyperswitch webhook handler', () => {
  beforeEach(() => processedEventIds.clear());

  it('has the 33 documented event types', () => {
    expect(KNOWN_EVENT_TYPES.size).toBe(33);
  });

  describe('signature verification', () => {
    it('accepts a valid signature', async () => {
      const res = await POST(build(eventBody('payment_succeeded')));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts an uppercase hex digest', async () => {
      const body = eventBody('payment_succeeded');
      expect((await POST(build(body, sign(body).toUpperCase()))).status).toBe(200);
    });

    it('accepts any content type', async () => {
      const body = eventBody('payment_succeeded');
      expect((await POST(build(body, sign(body), 'text/plain'))).status).toBe(200);
    });

    it('verifies the exact bytes, including non-canonical whitespace', async () => {
      const body = '{ "event_id": "evt_ws",   "event_type": "payment_succeeded" }';
      expect((await POST(build(body))).status).toBe(200);
    });

    it('rejects missing and empty signatures with 401', async () => {
      const body = eventBody('payment_succeeded');
      expect((await POST(build(body, null))).status).toBe(401);
      expect((await POST(build(body, ''))).status).toBe(401);
    });

    it('rejects a wrong secret with 401', async () => {
      const body = eventBody('payment_succeeded');
      expect((await POST(build(body, sign(body, 'wrong_secret')))).status).toBe(401);
    });

    it('rejects a tampered body with 401', async () => {
      const body = eventBody('payment_succeeded');
      expect((await POST(build(body.replace('pay_123', 'pay_999'), sign(body)))).status).toBe(401);
    });

    it('rejects a SHA-256 digest with 401', async () => {
      const body = eventBody('payment_succeeded');
      const sha256 = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
      expect((await POST(build(body, sha256))).status).toBe(401);
    });

    it('rejects a prefixed or non-hex signature with 401', async () => {
      const body = eventBody('payment_succeeded');
      expect((await POST(build(body, `sha512=${sign(body)}`))).status).toBe(401);
      expect((await POST(build(body, 'z'.repeat(128)))).status).toBe(401);
    });

    it('uses the secret as UTF-8 bytes, not hex-decoded', async () => {
      const body = eventBody('payment_succeeded');
      const decoded = crypto
        .createHmac('sha512', Buffer.from(SECRET, 'hex'))
        .update(body)
        .digest('hex');
      expect((await POST(build(body, decoded))).status).toBe(401);
    });

    it('returns 500 when the secret is not configured', async () => {
      delete process.env.HYPERSWITCH_WEBHOOK_SECRET;
      try {
        expect((await POST(build(eventBody('payment_succeeded')))).status).toBe(500);
      } finally {
        process.env.HYPERSWITCH_WEBHOOK_SECRET = SECRET;
      }
    });

    it('verifyHyperswitchSignature validates length and digest', () => {
      const body = Buffer.from('{"event_type":"payment_succeeded"}');
      expect(verifyHyperswitchSignature(body, sign(body.toString()), SECRET).valid).toBe(true);
      expect(verifyHyperswitchSignature(body, sign(body.toString()).slice(1), SECRET).valid).toBe(false);
    });
  });

  describe('payload handling', () => {
    it('returns 400 for a signed non-JSON body', async () => {
      expect((await POST(build('not json'))).status).toBe(400);
    });

    it.each([...KNOWN_EVENT_TYPES])('acknowledges %s', async (eventType) => {
      expect((await POST(build(eventBody(eventType)))).status).toBe(200);
    });

    it('acknowledges unknown event types', async () => {
      expect((await POST(build(eventBody('some_future_event')))).status).toBe(200);
    });

    it('acknowledges a duplicate event_id without re-processing', async () => {
      const body = eventBody('payment_succeeded', 'evt_dup');
      expect(await (await POST(build(body))).json()).toEqual({ received: true });
      expect(await (await POST(build(body))).json()).toEqual({ received: true, duplicate: true });
    });
  });
});
