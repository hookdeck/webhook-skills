import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/shippo/route';

// Shippo HMAC secrets are opaque strings provisioned by Shippo's solutions team.
// The secret is used as-is (UTF-8) as the HMAC key; it is NOT base64-decoded.
const TEST_SECRET = 'test_shippo_hmac_secret';
const TEST_TOKEN = 'test_url_token_123abc';

// Build a Shippo-Auth-Signature header: t=<ts>,v1=hex(HMAC-SHA256(secret, "<ts>.<body>"))
function generateSignature(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

const trackPayload = JSON.stringify({
  event: 'track_updated',
  test: true,
  data: {
    carrier: 'usps',
    tracking_number: '9205590164917312751089',
    tracking_status: { status: 'DELIVERED', status_date: '2016-07-23T00:00:00Z' },
  },
});

function post(payload: string, { signature, query = '' }: { signature?: string; query?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature) headers['shippo-auth-signature'] = signature;
  return POST(new Request(`http://localhost:3000/webhooks/shippo${query}`, {
    method: 'POST',
    headers,
    body: payload,
  }));
}

describe('Shippo webhook route', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('HMAC mode', () => {
    beforeEach(() => {
      process.env.SHIPPO_WEBHOOK_SECRET = TEST_SECRET;
      delete process.env.SHIPPO_WEBHOOK_TOKEN;
      delete process.env.SHIPPO_TIMESTAMP_TOLERANCE_SECONDS;
    });

    test('accepts a valid signature', async () => {
      const res = await post(trackPayload, { signature: generateSignature(trackPayload, TEST_SECRET) });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true, event: 'track_updated' });
    });

    test('rejects a missing signature header', async () => {
      const res = await post(trackPayload);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Missing Shippo-Auth-Signature header');
    });

    test('rejects a signature made with the wrong secret', async () => {
      const res = await post(trackPayload, { signature: generateSignature(trackPayload, 'wrong_secret') });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Invalid signature');
    });

    test('rejects a tampered body', async () => {
      const signature = generateSignature(trackPayload, TEST_SECRET);
      const res = await post(trackPayload.replace('DELIVERED', 'RETURNED'), { signature });
      expect(res.status).toBe(400);
    });

    test('accepts an old timestamp by default (retries and replays keep the original)', async () => {
      const old = Math.floor(Date.now() / 1000) - 86400;
      const res = await post(trackPayload, { signature: generateSignature(trackPayload, TEST_SECRET, old) });
      expect(res.status).toBe(200);
    });

    test('treats a non-numeric SHIPPO_TIMESTAMP_TOLERANCE_SECONDS as 0 (check off)', async () => {
      process.env.SHIPPO_TIMESTAMP_TOLERANCE_SECONDS = 'five minutes';
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const old = Math.floor(Date.now() / 1000) - 86400;
      const res = await post(trackPayload, { signature: generateSignature(trackPayload, TEST_SECRET, old) });
      expect(res.status).toBe(200);
      warn.mockRestore();
    });

    test('rejects an old timestamp when SHIPPO_TIMESTAMP_TOLERANCE_SECONDS is set', async () => {
      process.env.SHIPPO_TIMESTAMP_TOLERANCE_SECONDS = '300';
      const old = Math.floor(Date.now() / 1000) - 600;
      const res = await post(trackPayload, { signature: generateSignature(trackPayload, TEST_SECRET, old) });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Timestamp outside tolerance');
    });

    test('rejects a malformed header', async () => {
      const res = await post(trackPayload, { signature: 'garbage' });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Malformed Shippo-Auth-Signature header');
    });

    test('accepts when any of multiple v1 signatures matches', async () => {
      const ts = Math.floor(Date.now() / 1000);
      const good = generateSignature(trackPayload, TEST_SECRET, ts).split('v1=')[1];
      const res = await post(trackPayload, { signature: `t=${ts},v1=${'0'.repeat(64)},v1=${good}` });
      expect(res.status).toBe(200);
    });

    test('rejects invalid JSON even with a valid signature', async () => {
      const res = await post('not json', { signature: generateSignature('not json', TEST_SECRET) });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Invalid JSON payload');
    });

    test.each([
      ['track_updated', { tracking_number: '123', tracking_status: { status: 'TRANSIT' } }],
      ['transaction_created', { object_id: 'abc', status: 'SUCCESS', tracking_number: '9499' }],
      ['transaction_updated', { object_id: 'abc', status: 'REFUNDED' }],
      ['batch_created', 'batch # created'],
      ['batch_purchased', 'batch # processing complete'],
      ['automations_label_resolved', { request_id: 'b3b8f6b0', status: 'purchased' }],
      ['some_future_event', {}],
    ])('handles %s', async (event, data) => {
      const payload = JSON.stringify({ event, test: true, data });
      const res = await post(payload, { signature: generateSignature(payload, TEST_SECRET) });
      expect(res.status).toBe(200);
      expect((await res.json()).event).toBe(event);
    });
  });

  describe('URL token mode (no HMAC)', () => {
    beforeEach(() => {
      delete process.env.SHIPPO_WEBHOOK_SECRET;
      process.env.SHIPPO_WEBHOOK_TOKEN = TEST_TOKEN;
    });

    test('accepts the correct token', async () => {
      expect((await post(trackPayload, { query: `?token=${TEST_TOKEN}` })).status).toBe(200);
    });

    test('rejects a wrong token', async () => {
      const res = await post(trackPayload, { query: '?token=nope' });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Invalid token');
    });

    test('rejects a missing token', async () => {
      expect((await post(trackPayload)).status).toBe(400);
    });
  });

  test('requires both checks when HMAC and token are configured', async () => {
    process.env.SHIPPO_WEBHOOK_SECRET = TEST_SECRET;
    process.env.SHIPPO_WEBHOOK_TOKEN = TEST_TOKEN;
    const signature = generateSignature(trackPayload, TEST_SECRET);
    expect((await post(trackPayload, { signature, query: `?token=${TEST_TOKEN}` })).status).toBe(200);
    expect((await post(trackPayload, { signature, query: '?token=nope' })).status).toBe(400);
    expect((await post(trackPayload, { query: `?token=${TEST_TOKEN}` })).status).toBe(400);
  });

  test('returns 500 when neither secret nor token is configured', async () => {
    delete process.env.SHIPPO_WEBHOOK_SECRET;
    delete process.env.SHIPPO_WEBHOOK_TOKEN;
    expect((await post(trackPayload)).status).toBe(500);
  });
});
