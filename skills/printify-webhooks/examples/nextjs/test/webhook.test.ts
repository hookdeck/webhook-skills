import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/printify/route';

// Printify secrets are arbitrary strings (e.g. `openssl rand -hex 20`),
// used as-is (UTF-8) as the HMAC key.
const TEST_SECRET = '7afa37fd47d7a52ea644382e04962a83c16aef62';

// X-Pfy-Signature: sha256=<hex HMAC-SHA256 of the raw body>
function sign(payload: string, secret = TEST_SECRET): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function envelope(type: string, data: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: '653b6be8-2ff7-4ab5-a7a6-6889a8b3bbf5',
    type,
    created_at: '2017-04-18 13:24:28+00:00',
    resource: { id: '5cb87a8cd490a2ccb256cec4', type: type.split(':')[0], data },
  });
}

function post(payload: string, signature?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature) headers['x-pfy-signature'] = signature;
  return POST(new Request('http://localhost:3000/webhooks/printify', {
    method: 'POST',
    headers,
    body: payload,
  }) as any);
}

describe('Printify webhook route', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.PRINTIFY_WEBHOOK_SECRET = TEST_SECRET;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  test('accepts a valid signature', async () => {
    const payload = envelope('order:created');
    const res = await post(payload, sign(payload));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, type: 'order:created' });
  });

  test('verifies regardless of content type', async () => {
    const payload = envelope('order:created');
    const res = await post(payload, sign(payload), 'text/plain');
    expect(res.status).toBe(200);
  });

  test('rejects a missing signature header', async () => {
    const res = await post(envelope('order:created'));
    expect(res.status).toBe(400);
  });

  test('rejects an invalid signature', async () => {
    const payload = envelope('order:created');
    const res = await post(payload, sign(payload, 'wrong_secret'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a tampered body', async () => {
    const payload = envelope('order:created');
    const res = await post(payload.replace('order:created', 'order:updated'), sign(payload));
    expect(res.status).toBe(400);
  });

  test('rejects a signature without the sha256= prefix', async () => {
    const payload = envelope('order:created');
    const res = await post(payload, sign(payload).replace('sha256=', ''));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Malformed/);
  });

  test('rejects a signature of the wrong length', async () => {
    const res = await post(envelope('order:created'), 'sha256=abc123');
    expect(res.status).toBe(400);
  });

  test('rejects invalid JSON with a valid signature', async () => {
    const payload = 'not json';
    const res = await post(payload, sign(payload));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid JSON payload');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.PRINTIFY_WEBHOOK_SECRET;
    const payload = envelope('order:created');
    const res = await post(payload, sign(payload));
    expect(res.status).toBe(500);
  });

  test.each([
    ['order:created', {}],
    ['order:updated', { shop_id: 815256, status: 'in-production' }],
    ['order:line-item:canceled', { shop_id: 815256, line_item_id: 'abc', status: 'canceled', status_details: 'out_of_stock' }],
    ['order:sent-to-production', {}],
    ['order:shipment:created', { shop_id: 815256, carrier: { code: 'USPS', tracking_number: '9400' } }],
    ['order:shipment:delivered', { shop_id: 815256, delivered_at: '2017-04-18 13:24:28+00:00' }],
    ['product:created', { shop_id: 815256 }],
    ['product:updated', { shop_id: 815256 }],
    ['product:publish:started', { shop_id: 815256, action: 'create' }],
    ['product:deleted', { shop_id: 815256 }],
    ['shop:disconnected', {}],
    ['personalization-preview-task:processed', { task_id: 't1', status: 'completed' }],
  ])('accepts event %s', async (type, data) => {
    const payload = envelope(type as string, data as Record<string, unknown>);
    const res = await post(payload, sign(payload));
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe(type);
  });

  test('acknowledges unknown events', async () => {
    const payload = envelope('order:future-event');
    const res = await post(payload, sign(payload));
    expect(res.status).toBe(200);
  });
});
