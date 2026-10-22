const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.SHOPWARE_APP_SECRETS = JSON.stringify({
  'shop-1': 'secret_for_shop_1',
  'shop-2': 'secret_for_shop_2',
});
delete process.env.SHOPWARE_APP_SECRET;

const { app, verifyShopwareWebhook } = require('../src/index');

/**
 * Generate a valid Shopware signature (hex HMAC-SHA256 of the raw body)
 */
function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function buildBody(event, shopId = 'shop-1') {
  return JSON.stringify({
    data: { payload: [{ entity: 'product', operation: 'update', primaryKey: 'abc' }], event },
    source: { url: 'https://shop.example.com', appVersion: '1.0.0', shopId, eventId: 'evt_1' },
    timestamp: Math.floor(Date.now() / 1000),
  });
}

describe('verifyShopwareWebhook', () => {
  const body = Buffer.from('{"a":1}');

  it('returns true for a valid signature', () => {
    expect(verifyShopwareWebhook(body, sign(body, 's'), 's')).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    expect(verifyShopwareWebhook(body, 'deadbeef', 's')).toBe(false);
  });

  it('returns false for a missing signature or secret', () => {
    expect(verifyShopwareWebhook(body, undefined, 's')).toBe(false);
    expect(verifyShopwareWebhook(body, sign(body, 's'), null)).toBe(false);
  });

  it('returns false when signed with a different secret', () => {
    expect(verifyShopwareWebhook(body, sign(body, 'other'), 's')).toBe(false);
  });
});

describe('POST /webhooks/shopware', () => {
  const post = (body, headers = {}) =>
    request(app).post('/webhooks/shopware').set(headers).send(body);

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
      'Content-Type': 'application/json',
      'shopware-shop-signature': sign(body, 'secret_for_shop_1'),
    });
    expect(res.status).toBe(200);
  });

  it('verifies regardless of content type', async () => {
    const body = buildBody('product.written');
    const res = await post(body, {
      'Content-Type': 'text/plain',
      'shopware-shop-signature': sign(body, 'secret_for_shop_1'),
    });
    expect(res.status).toBe(200);
  });

  it('uses the secret of the shop named in the payload', async () => {
    const body = buildBody('product.written', 'shop-2');
    const ok = await post(body, {
      'Content-Type': 'application/json',
      'shopware-shop-signature': sign(body, 'secret_for_shop_2'),
    });
    expect(ok.status).toBe(200);

    const wrong = await post(body, {
      'Content-Type': 'application/json',
      'shopware-shop-signature': sign(body, 'secret_for_shop_1'),
    });
    expect(wrong.status).toBe(401);
  });

  it('rejects an invalid signature', async () => {
    const res = await post(buildBody('product.written'), {
      'Content-Type': 'application/json',
      'shopware-shop-signature': 'a'.repeat(64),
    });
    expect(res.status).toBe(401);
  });

  it('rejects a missing signature', async () => {
    const res = await post(buildBody('product.written'), { 'Content-Type': 'application/json' });
    expect(res.status).toBe(401);
  });

  it('rejects an unknown shop', async () => {
    const body = buildBody('product.written', 'unknown-shop');
    const res = await post(body, {
      'Content-Type': 'application/json',
      'shopware-shop-signature': sign(body, 'secret_for_shop_1'),
    });
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const body = buildBody('product.written');
    const res = await post(body.replace('abc', 'xyz'), {
      'Content-Type': 'application/json',
      'shopware-shop-signature': sign(body, 'secret_for_shop_1'),
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await post('not json', {
      'Content-Type': 'application/json',
      'shopware-shop-signature': sign('not json', 'secret_for_shop_1'),
    });
    expect(res.status).toBe(400);
  });
});
