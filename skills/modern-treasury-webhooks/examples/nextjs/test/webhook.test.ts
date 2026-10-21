import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/modern-treasury/route';
import { verifySignature } from '../lib/modern-treasury';

// Modern Treasury webhook keys are used as raw strings (no prefix, no decoding)
const WEBHOOK_KEY = 'test_webhook_key_for_modern_treasury';

// Same algorithm as Modern Treasury: lowercase hex HMAC-SHA256 of the raw body
function sign(body: string, key = WEBHOOK_KEY): string {
  return crypto.createHmac('sha256', key).update(body).digest('hex');
}

function makeRequest(
  body: object | string,
  opts: { topic?: string; signature?: string | null; webhookId?: string; contentType?: string } = {}
): NextRequest {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  const headers: Record<string, string> = {
    'content-type': opts.contentType ?? 'application/json',
    'x-topic': opts.topic ?? 'payment_order'
  };
  if (opts.signature !== null) headers['x-signature'] = opts.signature ?? sign(payload);
  if (opts.webhookId) headers['x-webhook-id'] = opts.webhookId;
  return new NextRequest('http://localhost:3000/webhooks/modern-treasury', {
    method: 'POST',
    headers,
    body: payload
  });
}

const completed = {
  event: 'completed',
  data: { id: '0198860a-5655-7dbc-9cbd-6616a8090fa8', object: 'payment_order', status: 'completed' }
};

describe('Modern Treasury webhook', () => {
  beforeEach(() => {
    process.env.MODERN_TREASURY_WEBHOOK_KEY = WEBHOOK_KEY;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('accepts a payment_order.completed event with a valid signature', async () => {
    const res = await POST(makeRequest(completed));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it.each([
    ['payment_order', 'failed'],
    ['payment_order', 'reconciled'],
    ['expected_payment', 'reconciled'],
    ['incoming_payment_detail', 'completed'],
    ['transaction', 'created'],
    ['return', 'created']
  ])('accepts %s.%s', async (topic, event) => {
    const res = await POST(makeRequest({ event, data: { id: 'abc' } }, { topic }));
    expect(res.status).toBe(200);
  });

  it('accepts unknown topic/event combinations after verifying them', async () => {
    const res = await POST(makeRequest({ event: 'something_new', data: {} }, { topic: 'new_topic' }));
    expect(res.status).toBe(200);
  });

  it('rejects an invalid signature', async () => {
    const res = await POST(makeRequest(completed, { signature: 'a'.repeat(64) }));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with the wrong key', async () => {
    const payload = JSON.stringify(completed);
    const res = await POST(makeRequest(payload, { signature: sign(payload, 'other_key') }));
    expect(res.status).toBe(400);
  });

  it('rejects a signature of the wrong length without throwing', async () => {
    const res = await POST(makeRequest(completed, { signature: 'abc123' }));
    expect(res.status).toBe(400);
  });

  it('rejects a missing signature header', async () => {
    const res = await POST(makeRequest(completed, { signature: null }));
    expect(res.status).toBe(400);
  });

  it('rejects a body modified after signing', async () => {
    const signature = sign(JSON.stringify(completed));
    const tampered = JSON.stringify({ ...completed, event: 'failed' });
    const res = await POST(makeRequest(tampered, { signature }));
    expect(res.status).toBe(400);
  });

  it('signs the exact bytes received, not a re-serialized body', async () => {
    const raw = '{ "event":  "completed",\n "data": {"id": "spaced"} }';
    const res = await POST(makeRequest(raw));
    expect(res.status).toBe(200);
  });

  it('verifies regardless of Content-Type', async () => {
    const res = await POST(makeRequest(completed, { contentType: 'text/plain' }));
    expect(res.status).toBe(200);
  });

  it('returns 400 for a validly signed body that is not JSON', async () => {
    const res = await POST(makeRequest('not json'));
    expect(res.status).toBe(400);
  });

  it('flags a retried webhook (same X-Webhook-ID) as a duplicate', async () => {
    const first = await POST(makeRequest(completed, { webhookId: 'wh_retry_1' }));
    const second = await POST(makeRequest(completed, { webhookId: 'wh_retry_1' }));
    expect(await first.json()).toEqual({ received: true });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ received: true, duplicate: true });
  });

  it('returns 500 when the webhook key is not configured', async () => {
    delete process.env.MODERN_TREASURY_WEBHOOK_KEY;
    const res = await POST(makeRequest(completed));
    expect(res.status).toBe(500);
  });
});

describe('verifySignature', () => {
  it('accepts a correctly signed body', () => {
    const body = '{"event":"created"}';
    expect(verifySignature(body, sign(body), WEBHOOK_KEY)).toBe(true);
  });

  it('accepts uppercase hex', () => {
    const body = '{"event":"created"}';
    expect(verifySignature(body, sign(body).toUpperCase(), WEBHOOK_KEY)).toBe(true);
  });

  it('returns false for missing inputs', () => {
    expect(verifySignature('{}', null, WEBHOOK_KEY)).toBe(false);
    expect(verifySignature('{}', 'abc', undefined)).toBe(false);
  });
});
