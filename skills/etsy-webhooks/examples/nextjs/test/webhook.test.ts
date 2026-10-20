import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../app/webhooks/etsy/route';

// Etsy secrets are 'whsec_' + base64-encoded key bytes.
// base64 of "test_etsy_webhook_secret_key"
const TEST_SECRET = 'whsec_dGVzdF9ldHN5X3dlYmhvb2tfc2VjcmV0X2tleQ==';

// Sign exactly as Etsy does: HMAC-SHA256 over "{id}.{timestamp}.{body}", base64
function sign(payload: string, id: string, timestamp: string, secret = TEST_SECRET): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${payload}`).digest('base64');
  return `v1,${sig}`;
}

function nowSeconds(): string {
  return Math.floor(Date.now() / 1000).toString();
}

function msgId(): string {
  return `msg_${crypto.randomBytes(12).toString('hex')}`;
}

function orderPayload(eventType = 'order.paid'): string {
  return JSON.stringify({
    event_type: eventType,
    resource_url: 'https://api.etsy.com/v3/application/shops/12345678/receipts/987654321',
    shop_id: '12345678',
  });
}

function makeRequest(payload: string, headers: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/etsy', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: payload,
  });
}

function signedRequest(payload: string): NextRequest {
  const id = msgId();
  const timestamp = nowSeconds();
  return makeRequest(payload, {
    'webhook-id': id,
    'webhook-timestamp': timestamp,
    'webhook-signature': sign(payload, id, timestamp),
  });
}

describe('Etsy webhook route', () => {
  beforeAll(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  beforeEach(() => {
    process.env.ETSY_WEBHOOK_SECRET = TEST_SECRET;
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('accepts a validly signed order.paid webhook', async () => {
    const res = await POST(signedRequest(orderPayload()));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, event_type: 'order.paid' });
  });

  it.each([
    'order.paid',
    'order.canceled',
    'order.shipped',
    'order.delivered',
    'listing.created',
    'listing.updated',
    'listing.deleted',
    'inventory.created',
    'inventory.updated',
    'inventory.deleted',
    'inventory.out_of_stock',
  ])('handles %s', async (eventType) => {
    const payload = JSON.stringify({
      event_type: eventType,
      resource_url: 'https://api.etsy.com/v3/application/shops/12345678/listings/111/products/222',
      shop_id: '12345678',
      listing_id: '111',
      product_id: '222',
    });

    const res = await POST(signedRequest(payload));

    expect(res.status).toBe(200);
    expect((await res.json()).event_type).toBe(eventType);
  });

  it('accepts unknown event types', async () => {
    const res = await POST(signedRequest(orderPayload('shop.something_new')));

    expect(res.status).toBe(200);
  });

  it('accepts when one of several signatures matches', async () => {
    const payload = orderPayload();
    const id = msgId();
    const timestamp = nowSeconds();

    const res = await POST(
      makeRequest(payload, {
        'webhook-id': id,
        'webhook-timestamp': timestamp,
        'webhook-signature': `v1,aW52YWxpZHNpZ25hdHVyZQ== ${sign(payload, id, timestamp)}`,
      })
    );

    expect(res.status).toBe(200);
  });

  it('rejects missing headers', async () => {
    const res = await POST(makeRequest(orderPayload(), {}));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('Missing required webhook headers');
  });

  it('rejects an invalid signature', async () => {
    const res = await POST(
      makeRequest(orderPayload(), {
        'webhook-id': msgId(),
        'webhook-timestamp': nowSeconds(),
        'webhook-signature': 'v1,aW52YWxpZHNpZ25hdHVyZQ==',
      })
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  it('rejects a signature made with a different secret', async () => {
    const payload = orderPayload();
    const id = msgId();
    const timestamp = nowSeconds();
    const otherSecret = `whsec_${Buffer.from('some_other_secret').toString('base64')}`;

    const res = await POST(
      makeRequest(payload, {
        'webhook-id': id,
        'webhook-timestamp': timestamp,
        'webhook-signature': sign(payload, id, timestamp, otherSecret),
      })
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  it('rejects a tampered body', async () => {
    const id = msgId();
    const timestamp = nowSeconds();
    const signature = sign(orderPayload(), id, timestamp);

    const res = await POST(
      makeRequest(orderPayload('order.canceled'), {
        'webhook-id': id,
        'webhook-timestamp': timestamp,
        'webhook-signature': signature,
      })
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  it('rejects a stale timestamp', async () => {
    const payload = orderPayload();
    const id = msgId();
    const timestamp = (Math.floor(Date.now() / 1000) - 600).toString();

    const res = await POST(
      makeRequest(payload, {
        'webhook-id': id,
        'webhook-timestamp': timestamp,
        'webhook-signature': sign(payload, id, timestamp),
      })
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Timestamp outside tolerance');
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.ETSY_WEBHOOK_SECRET;

    const res = await POST(signedRequest(orderPayload()));

    expect(res.status).toBe(500);
  });
});
