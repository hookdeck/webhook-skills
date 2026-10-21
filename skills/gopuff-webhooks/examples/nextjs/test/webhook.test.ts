import { describe, test, expect, beforeAll, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/gopuff/route';

// Svix secrets are 'whsec_' + base64(key). base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// base64(HMAC_SHA256(base64Decode(secret), `${id}.${timestamp}.${payload}`))
function sign(payload: string, timestamp: string, msgId: string): string {
  const key = Buffer.from(TEST_SECRET.split('_')[1], 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000).toString();
const newId = () => 'msg_' + crypto.randomBytes(12).toString('hex');

function makeRequest(payload: string, headers: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/gopuff', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: payload,
  });
}

function signedHeaders(payload: string, ts = now(), id = newId()) {
  return { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': sign(payload, ts, id) };
}

const orderV2 = (status: string) =>
  JSON.stringify({
    order: { id: '0123456789', location_id: 482, partner_order_id: 'ABC-512351', status, cancel_reason: null },
  });

describe('Gopuff webhook handler', () => {
  beforeAll(() => {
    process.env.GOPUFF_WEBHOOK_SECRET = TEST_SECRET;
  });

  test('accepts a valid order.status.v2 payload', async () => {
    const p = orderV2('Delivery');
    const res = await POST(makeRequest(p, signedHeaders(p)));
    expect(res.status).toBe(200);
    expect((await res.json()).kind).toBe('order');
  });

  test('accepts a Finished order (order.delivered)', async () => {
    const p = orderV2('Finished');
    expect((await POST(makeRequest(p, signedHeaders(p)))).status).toBe(200);
  });

  test('accepts a Cancelled order', async () => {
    const p = JSON.stringify({ order: { id: '1', status: 'Cancelled', cancel_reason: 'customer' } });
    expect((await POST(makeRequest(p, signedHeaders(p)))).status).toBe(200);
  });

  test('accepts a delivery status payload', async () => {
    const p = JSON.stringify({ id: '1', driver: { location: { latitude: 37.7, longitude: -122.4 } }, partner_order_id: 'A' });
    const res = await POST(makeRequest(p, signedHeaders(p)));
    expect(res.status).toBe(200);
    expect((await res.json()).kind).toBe('delivery_status');
  });

  test('accepts a delivery ETA payload', async () => {
    const p = JSON.stringify({ id: '1', partner_order_id: 'A', expected_delivery_time: { min: '2025-08-21T18:35:00.000Z', max: '2025-08-21T18:50:00.000Z' } });
    const res = await POST(makeRequest(p, signedHeaders(p)));
    expect(res.status).toBe(200);
    expect((await res.json()).kind).toBe('delivery_eta');
  });

  test('accepts webhook-* header aliases', async () => {
    const p = orderV2('Packed');
    const ts = now();
    const id = newId();
    const res = await POST(makeRequest(p, { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': sign(p, ts, id) }));
    expect(res.status).toBe(200);
  });

  test('accepts multiple signatures (secret rotation)', async () => {
    const p = orderV2('Packed');
    const ts = now();
    const id = newId();
    const res = await POST(makeRequest(p, { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,aW52YWxpZA== ${sign(p, ts, id)}` }));
    expect(res.status).toBe(200);
  });

  test('handles unknown payloads gracefully', async () => {
    const p = JSON.stringify({ hello: 'world' });
    const res = await POST(makeRequest(p, signedHeaders(p)));
    expect(res.status).toBe(200);
    expect((await res.json()).kind).toBe('unknown');
  });

  test('rejects missing headers', async () => {
    const res = await POST(makeRequest(orderV2('Packed'), {}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('Missing required');
  });

  test('rejects an invalid signature', async () => {
    const res = await POST(makeRequest(orderV2('Packed'), { 'svix-id': newId(), 'svix-timestamp': now(), 'svix-signature': 'v1,aW52YWxpZA==' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a tampered body', async () => {
    const h = signedHeaders(orderV2('Packed'));
    expect((await POST(makeRequest(orderV2('Finished'), h))).status).toBe(400);
  });

  test('accepts an old timestamp by default (retries and replays keep the original)', async () => {
    const old = (Math.floor(Date.now() / 1000) - 3600).toString();
    const p = orderV2('Packed');
    const res = await POST(makeRequest(p, signedHeaders(p, old)));
    expect(res.status).toBe(200);
  });

  test('rejects an old timestamp when GOPUFF_TIMESTAMP_TOLERANCE_SECONDS is set', async () => {
    process.env.GOPUFF_TIMESTAMP_TOLERANCE_SECONDS = '300';
    try {
      const old = (Math.floor(Date.now() / 1000) - 3600).toString();
      const p = orderV2('Packed');
      const res = await POST(makeRequest(p, signedHeaders(p, old)));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Timestamp too old');
    } finally {
      delete process.env.GOPUFF_TIMESTAMP_TOLERANCE_SECONDS;
    }
  });

  test('treats a non-numeric GOPUFF_TIMESTAMP_TOLERANCE_SECONDS as 0 (check off)', async () => {
    process.env.GOPUFF_TIMESTAMP_TOLERANCE_SECONDS = 'five minutes';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const old = (Math.floor(Date.now() / 1000) - 3600).toString();
      const p = orderV2('Packed');
      const res = await POST(makeRequest(p, signedHeaders(p, old)));
      expect(res.status).toBe(200);
    } finally {
      delete process.env.GOPUFF_TIMESTAMP_TOLERANCE_SECONDS;
      warn.mockRestore();
    }
  });

  test('rejects signed non-JSON body', async () => {
    const p = 'not json';
    const res = await POST(makeRequest(p, signedHeaders(p)));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid JSON');
  });
});
