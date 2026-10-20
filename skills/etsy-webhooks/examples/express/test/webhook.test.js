const crypto = require('crypto');
const request = require('supertest');

// Etsy secrets are 'whsec_' + base64-encoded key bytes.
// base64 of "test_etsy_webhook_secret_key"
const TEST_SECRET = 'whsec_dGVzdF9ldHN5X3dlYmhvb2tfc2VjcmV0X2tleQ==';
process.env.ETSY_WEBHOOK_SECRET = TEST_SECRET;

const { app } = require('../src/index');

// Sign exactly as Etsy does: HMAC-SHA256 over "{id}.{timestamp}.{body}", base64
function sign(payload, { id, timestamp, secret = TEST_SECRET }) {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${payload}`).digest('base64');
  return `v1,${sig}`;
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000).toString();
}

function msgId() {
  return `msg_${crypto.randomBytes(12).toString('hex')}`;
}

function orderPayload(eventType = 'order.paid') {
  return JSON.stringify({
    event_type: eventType,
    resource_url: 'https://api.etsy.com/v3/application/shops/12345678/receipts/987654321',
    shop_id: '12345678',
  });
}

function send(payload, headers) {
  let req = request(app).post('/webhooks/etsy').set('Content-Type', 'application/json');
  for (const [k, v] of Object.entries(headers)) req = req.set(k, v);
  return req.send(payload);
}

describe('Etsy webhook handler', () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  test('accepts a validly signed order.paid webhook', async () => {
    const payload = orderPayload();
    const id = msgId();
    const timestamp = nowSeconds();

    const res = await send(payload, {
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': sign(payload, { id, timestamp }),
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, event_type: 'order.paid' });
  });

  test.each([
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
    const id = msgId();
    const timestamp = nowSeconds();

    const res = await send(payload, {
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': sign(payload, { id, timestamp }),
    });

    expect(res.status).toBe(200);
    expect(res.body.event_type).toBe(eventType);
  });

  test('accepts unknown event types', async () => {
    const payload = orderPayload('shop.something_new');
    const id = msgId();
    const timestamp = nowSeconds();

    const res = await send(payload, {
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': sign(payload, { id, timestamp }),
    });

    expect(res.status).toBe(200);
  });

  test('accepts when one of several signatures matches', async () => {
    const payload = orderPayload();
    const id = msgId();
    const timestamp = nowSeconds();
    const valid = sign(payload, { id, timestamp });

    const res = await send(payload, {
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': `v1,aW52YWxpZHNpZ25hdHVyZQ== ${valid}`,
    });

    expect(res.status).toBe(200);
  });

  test('rejects missing headers', async () => {
    const res = await send(orderPayload(), {});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Missing required webhook headers');
  });

  test('rejects an invalid signature', async () => {
    const payload = orderPayload();

    const res = await send(payload, {
      'webhook-id': msgId(),
      'webhook-timestamp': nowSeconds(),
      'webhook-signature': 'v1,aW52YWxpZHNpZ25hdHVyZQ==',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = orderPayload();
    const id = msgId();
    const timestamp = nowSeconds();
    const otherSecret = `whsec_${Buffer.from('some_other_secret').toString('base64')}`;

    const res = await send(payload, {
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': sign(payload, { id, timestamp, secret: otherSecret }),
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a tampered body', async () => {
    const payload = orderPayload();
    const id = msgId();
    const timestamp = nowSeconds();
    const signature = sign(payload, { id, timestamp });

    const res = await send(orderPayload('order.canceled'), {
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a stale timestamp', async () => {
    const payload = orderPayload();
    const id = msgId();
    const timestamp = (Math.floor(Date.now() / 1000) - 600).toString();

    const res = await send(payload, {
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': sign(payload, { id, timestamp }),
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Timestamp outside tolerance');
  });

  test('health check works', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
