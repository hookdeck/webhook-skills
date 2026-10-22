import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/shopware/route';
import { verifyShopwareWebhook } from '../lib/shopware';

beforeAll(() => {
  process.env.SHOPWARE_APP_SECRETS = JSON.stringify({
    'shop-1': 'secret_for_shop_1',
    'shop-2': 'secret_for_shop_2',
  });
  delete process.env.SHOPWARE_APP_SECRET;
});

/**
 * Generate a valid Shopware signature (hex HMAC-SHA256 of the raw body)
 */
function sign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function buildBody(event: string, shopId = 'shop-1'): string {
  return JSON.stringify({
    data: { payload: [{ entity: 'product', operation: 'update', primaryKey: 'abc' }], event },
    source: { url: 'https://shop.example.com', appVersion: '1.0.0', shopId, eventId: 'evt_1' },
    timestamp: Math.floor(Date.now() / 1000),
  });
}

function post(body: string, headers: Record<string, string> = {}) {
  return POST(
    new NextRequest('http://localhost:3000/webhooks/shopware', {
      method: 'POST',
      headers,
      body,
    })
  );
}

describe('verifyShopwareWebhook', () => {
  it('returns true for a valid signature', () => {
    expect(verifyShopwareWebhook('{"a":1}', sign('{"a":1}', 's'), 's')).toBe(true);
  });

  it('returns false for invalid, missing, or wrong-secret signatures', () => {
    expect(verifyShopwareWebhook('{"a":1}', 'deadbeef', 's')).toBe(false);
    expect(verifyShopwareWebhook('{"a":1}', null, 's')).toBe(false);
    expect(verifyShopwareWebhook('{"a":1}', sign('{"a":1}', 'other'), 's')).toBe(false);
    expect(verifyShopwareWebhook('{"a":1}', sign('{"a":1}', 's'), null)).toBe(false);
  });
});

describe('POST /webhooks/shopware', () => {
  it.each([
    'checkout.order.placed',
    'product.written',
    'order.written',
    'customer.written',
    'state_enter.order.state.completed',
    'state_enter.order_transaction.state.paid',
    'some.unknown.event',
  ])('accepts a validly signed %s event', async (event) => {
    const body = buildBody(event);
    const res = await post(body, {
      'content-type': 'application/json',
      'shopware-shop-signature': sign(body, 'secret_for_shop_1'),
    });
    expect(res.status).toBe(200);
  });

  it('verifies regardless of content type', async () => {
    const body = buildBody('product.written');
    const res = await post(body, {
      'content-type': 'text/plain',
      'shopware-shop-signature': sign(body, 'secret_for_shop_1'),
    });
    expect(res.status).toBe(200);
  });

  it('uses the secret of the shop named in the payload', async () => {
    const body = buildBody('product.written', 'shop-2');
    expect(
      (await post(body, { 'shopware-shop-signature': sign(body, 'secret_for_shop_2') })).status
    ).toBe(200);
    expect(
      (await post(body, { 'shopware-shop-signature': sign(body, 'secret_for_shop_1') })).status
    ).toBe(401);
  });

  it('rejects invalid, missing, tampered, and unknown-shop requests', async () => {
    const body = buildBody('product.written');
    expect((await post(body, { 'shopware-shop-signature': 'a'.repeat(64) })).status).toBe(401);
    expect((await post(body)).status).toBe(401);
    expect(
      (await post(body.replace('abc', 'xyz'), {
        'shopware-shop-signature': sign(body, 'secret_for_shop_1'),
      })).status
    ).toBe(401);
    const unknown = buildBody('product.written', 'unknown-shop');
    expect(
      (await post(unknown, { 'shopware-shop-signature': sign(unknown, 'secret_for_shop_1') })).status
    ).toBe(401);
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await post('not json', {
      'shopware-shop-signature': sign('not json', 'secret_for_shop_1'),
    });
    expect(res.status).toBe(400);
  });
});
