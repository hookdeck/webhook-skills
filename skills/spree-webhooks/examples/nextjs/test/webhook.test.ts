import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Spree secret_key values are 64-character hex strings, used as-is (UTF-8) as the HMAC key.
const secret = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

import { POST } from '../app/webhooks/spree/route';

const now = () => String(Math.floor(Date.now() / 1000));

/** Hex HMAC-SHA256 of "<timestamp>." + raw body */
function sign(body: string, timestamp: string, key = secret): string {
  return crypto
    .createHmac('sha256', key)
    .update(Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), Buffer.from(body)]))
    .digest('hex');
}

function eventPayload(name: string, data: Record<string, unknown> = { id: 'or_123' }): string {
  return JSON.stringify({
    id: 'evt_01',
    name,
    created_at: '2026-10-26T12:00:00Z',
    data,
    metadata: { spree_version: '6.0.0' },
  });
}

function makeRequest(
  body: string,
  opts: { signature?: string; timestamp?: string; contentType?: string } = {}
): NextRequest {
  const headers: Record<string, string> = { 'content-type': opts.contentType ?? 'application/json' };
  if (opts.timestamp !== undefined) headers['x-spree-webhook-timestamp'] = opts.timestamp;
  if (opts.signature !== undefined) headers['x-spree-webhook-signature'] = opts.signature;
  return new NextRequest('http://localhost:3000/webhooks/spree', { method: 'POST', headers, body });
}

function signedRequest(body: string, timestamp = now(), contentType?: string): NextRequest {
  return makeRequest(body, { signature: sign(body, timestamp), timestamp, contentType });
}

describe('Spree Webhook Route', () => {
  beforeEach(() => {
    process.env.SPREE_WEBHOOK_SECRET = secret;
  });

  afterEach(() => {
    delete process.env.SPREE_WEBHOOK_TOLERANCE_SECONDS;
  });

  describe('valid deliveries', () => {
    it.each([
      'order.placed',
      'order.paid',
      'order.canceled',
      'payment.completed',
      'fulfillment.fulfilled',
      'user.created',
      'product.updated',
      'webhook.test',
      'order.some_future_event',
    ])('returns 200 for %s', async (name) => {
      const response = await POST(signedRequest(eventPayload(name)));
      expect(response.status).toBe(200);
    });

    it('accepts any content type (raw bytes are verified)', async () => {
      const response = await POST(signedRequest(eventPayload('order.placed'), now(), 'text/plain'));
      expect(response.status).toBe(200);
    });

    it('accepts an uppercase hex signature', async () => {
      const body = eventPayload('order.placed');
      const timestamp = now();
      const response = await POST(makeRequest(body, { signature: sign(body, timestamp).toUpperCase(), timestamp }));
      expect(response.status).toBe(200);
    });

    it('verifies multi-byte UTF-8 bodies byte for byte', async () => {
      const body = eventPayload('order.placed', { id: 'or_1', note: 'Café ☃ 🚀' });
      const response = await POST(signedRequest(body));
      expect(response.status).toBe(200);
    });

    it('verifies the body exactly as sent (extra whitespace is part of the signed bytes)', async () => {
      const response = await POST(signedRequest(`  ${eventPayload('order.placed')}\n`));
      expect(response.status).toBe(200);
    });
  });

  describe('rejected deliveries', () => {
    it('returns 401 for a missing signature', async () => {
      const response = await POST(makeRequest(eventPayload('order.placed'), { timestamp: now() }));
      expect(response.status).toBe(401);
    });

    it('returns 401 for an empty signature', async () => {
      const response = await POST(makeRequest(eventPayload('order.placed'), { signature: '', timestamp: now() }));
      expect(response.status).toBe(401);
    });

    it('returns 401 for a missing timestamp', async () => {
      const body = eventPayload('order.placed');
      const response = await POST(makeRequest(body, { signature: sign(body, now()) }));
      expect(response.status).toBe(401);
    });

    it('returns 401 for an empty timestamp', async () => {
      const body = eventPayload('order.placed');
      const response = await POST(makeRequest(body, { signature: sign(body, ''), timestamp: '' }));
      expect(response.status).toBe(401);
    });

    it('returns 401 for a signature with the wrong length', async () => {
      const response = await POST(makeRequest(eventPayload('order.placed'), { signature: 'abc123', timestamp: now() }));
      expect(response.status).toBe(401);
    });

    it('returns 401 for a 64-character non-hex signature', async () => {
      const response = await POST(
        makeRequest(eventPayload('order.placed'), { signature: 'z'.repeat(64), timestamp: now() })
      );
      expect(response.status).toBe(401);
    });

    it('returns 401 for a prefixed signature (the header is a bare digest)', async () => {
      const body = eventPayload('order.placed');
      const timestamp = now();
      const response = await POST(makeRequest(body, { signature: `sha256=${sign(body, timestamp)}`, timestamp }));
      expect(response.status).toBe(401);
    });

    it('returns 401 for a signature made with the wrong secret', async () => {
      const body = eventPayload('order.placed');
      const timestamp = now();
      const response = await POST(makeRequest(body, { signature: sign(body, timestamp, 'wrong_secret'), timestamp }));
      expect(response.status).toBe(401);
    });

    it('returns 401 when the secret is hex-decoded instead of used as a string', async () => {
      const body = eventPayload('order.placed');
      const timestamp = now();
      const signature = crypto
        .createHmac('sha256', Buffer.from(secret, 'hex'))
        .update(Buffer.concat([Buffer.from(`${timestamp}.`), Buffer.from(body)]))
        .digest('hex');
      const response = await POST(makeRequest(body, { signature, timestamp }));
      expect(response.status).toBe(401);
    });

    it('returns 401 for a tampered body', async () => {
      const timestamp = now();
      const signature = sign(eventPayload('order.placed'), timestamp);
      const response = await POST(makeRequest(eventPayload('order.canceled'), { signature, timestamp }));
      expect(response.status).toBe(401);
    });

    it('returns 401 when the timestamp header differs from the signed one', async () => {
      const body = eventPayload('order.placed');
      const response = await POST(
        makeRequest(body, { signature: sign(body, now()), timestamp: String(Number(now()) + 1) })
      );
      expect(response.status).toBe(401);
    });

    it('returns 401 for a body signed without the timestamp', async () => {
      const body = eventPayload('order.placed');
      const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');
      const response = await POST(makeRequest(body, { signature, timestamp: now() }));
      expect(response.status).toBe(401);
    });

    it('returns 401 when no secret is configured', async () => {
      delete process.env.SPREE_WEBHOOK_SECRET;
      const response = await POST(signedRequest(eventPayload('order.placed')));
      expect(response.status).toBe(401);
    });

    it('returns 400 for invalid JSON with a valid signature', async () => {
      const response = await POST(signedRequest('not json'));
      expect(response.status).toBe(400);
    });
  });

  describe('timestamp tolerance (opt-in)', () => {
    const old = String(Math.floor(Date.now() / 1000) - 3600);

    it('accepts old timestamps by default (retries and replays keep the original)', async () => {
      const response = await POST(signedRequest(eventPayload('order.placed'), old));
      expect(response.status).toBe(200);
    });

    it('rejects old timestamps when a tolerance is set', async () => {
      process.env.SPREE_WEBHOOK_TOLERANCE_SECONDS = '300';
      const response = await POST(signedRequest(eventPayload('order.placed'), old));
      expect(response.status).toBe(401);
    });

    it('accepts fresh timestamps when a tolerance is set', async () => {
      process.env.SPREE_WEBHOOK_TOLERANCE_SECONDS = '300';
      const response = await POST(signedRequest(eventPayload('order.placed')));
      expect(response.status).toBe(200);
    });

    it('treats 0 as off', async () => {
      process.env.SPREE_WEBHOOK_TOLERANCE_SECONDS = '0';
      const response = await POST(signedRequest(eventPayload('order.placed'), old));
      expect(response.status).toBe(200);
    });
  });
});
