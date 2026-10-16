// Generated with: whatnot-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Whatnot's secret format isn't documented (a Whatnot representative gives it
// to you), so any string works for tests.
const SECRET = 'whatnot_test_webhook_secret';
process.env.WHATNOT_WEBHOOK_SECRET = SECRET;

const { app, verifyWhatnotSignature, processedEvents } = require('../src/index');

// Sign exactly the way Whatnot does: HMAC-SHA256 over the raw body, lowercase hex.
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

/*
 * ILLUSTRATIVE payloads. Whatnot's docs only show placeholder values, so the
 * IDs below are made up and are NOT Whatnot's real Global ID format. The field
 * names and shapes follow the docs for each topic.
 */
const money = (amount) => ({ amount, currency: 'USD' });

const OBJECTS = {
  'product/sold': {
    product_id: 'example-product-id',
    listing_id: 'example-listing-id',
    order_id: 'example-order-id',
    external_id: 'sku-123',
    variant_id: null,
    variant_external_id: null,
    quantity: 1,
    product_created_by_client_app_id: null,
  },
  'bulk_operation/finished': { id: 'example-bulk-operation-id', status: 'COMPLETED' },
  'listing/created': {
    product_id: 'example-product-id',
    listing_id: 'example-listing-id',
    external_id: null,
    quantity: 5,
    transaction_type: 'BUY_IT_NOW',
    listing_status: null,
    condition: null,
    category_name: null,
    category_id: null,
  },
  'listing/updated': {
    product_id: null,
    listing_id: 'example-listing-id',
    external_id: null,
    quantity: 4,
    transaction_type: 'AUCTION',
    listing_status: null,
    condition: null,
    category_name: null,
    category_id: null,
  },
  'order/created': {
    product_id: 'example-product-id',
    listing_id: 'example-listing-id',
    external_id: null,
    order_id: 'example-order-id',
    quantity: 1,
    subtotal: money('20.00'),
    shipping_price: money('5.00'),
    taxation: money('1.60'),
    customs: null,
    total: money('26.60'),
    items: [
      {
        product_id: 'example-product-id',
        listing_id: 'example-listing-id',
        price: money('20.00'),
        quantity: 1,
        subtotal: money('20.00'),
        variant_id: null,
        variant_external_id: null,
      },
    ],
    product_created_by_client_app_id: null,
    // With the read_customers scope:
    shipping_address: {
      address_line1: '1 Example St',
      address_line2: null,
      city: 'Los Angeles',
      state: 'CA',
      postal_code: '90001',
      country: 'US',
    },
    tracking_info: { tracking_code: '1Z999', courier: 'UPS', label_url: 'https://example.test/label.pdf' },
    cancelled_at: null,
  },
  'order/updated': {
    product_id: 'example-product-id',
    listing_id: 'example-listing-id',
    external_id: null,
    order_id: 'example-order-id',
    quantity: 1,
    subtotal: money('20.00'),
    shipping_price: money('5.00'),
    taxation: money('1.60'),
    customs: null,
    total: money('26.60'),
    items: [],
    product_created_by_client_app_id: null,
    // Without the read_customers scope these are null:
    shipping_address: null,
    tracking_info: null,
    cancelled_at: '2026-10-16T12:30:00Z',
  },
  'livestream/created': {
    livestream_id: 'example-livestream-id',
    title: 'Friday card breaks',
    starts_at: null,
  },
  'livestream/stopped': { livestream_id: 'example-livestream-id' },
  'livestream/product_added': {
    product_id: 'example-product-id',
    livestream_id: 'example-livestream-id',
    listing_id: 'example-listing-id',
    product_external_id: null,
  },
  'livestream/product_removed': {
    product_id: 'example-product-id',
    livestream_id: 'example-livestream-id',
    listing_id: 'example-listing-id',
    product_external_id: 'sku-123',
  },
  'shipment/label_created': {
    shipment_id: 'example-shipment-id',
    reason: 'label_generated',
    tracking_code: '9400100000000000000000',
    courier: 'USPS',
    label_url: null,
    label_generated_at: '2026-10-16T12:00:00Z',
  },
};

const TOPICS = Object.keys(OBJECTS);

function envelope(topic, object = OBJECTS[topic]) {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    topic,
    object,
  };
}

function send(body, signature, headers = {}) {
  let req = request(app).post('/webhooks/whatnot').set('Content-Type', 'application/json');
  if (signature !== undefined) req = req.set('X-Whatnot-Webhook-Signature', signature);
  for (const [k, v] of Object.entries(headers)) req = req.set(k, v);
  return req.send(body);
}

beforeEach(() => {
  process.env.WHATNOT_WEBHOOK_SECRET = SECRET;
  processedEvents.clear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('verifyWhatnotSignature', () => {
  // Fixed vector, shared with the Next.js and FastAPI tests. The expected hex
  // was produced with Whatnot's own Python sample (hmac.new(...).hexdigest()).
  const VECTOR_BODY =
    '{"id":"00000000-0000-4000-8000-000000000001","timestamp":"2026-10-16T12:00:00Z","topic":"livestream/stopped","object":{"livestream_id":"example-livestream-id"}}';
  const VECTOR_SIG = '8c8bbd9060c6d9dcf6a7c0e7a29c409cdadbce1aed62394be99726573a19e4eb';

  test('matches the fixed vector', () => {
    expect(sign(VECTOR_BODY)).toBe(VECTOR_SIG);
    expect(verifyWhatnotSignature(Buffer.from(VECTOR_BODY), VECTOR_SIG, SECRET)).toBe(true);
  });

  test('accepts uppercase hex (hex is case-insensitive)', () => {
    expect(verifyWhatnotSignature(Buffer.from(VECTOR_BODY), VECTOR_SIG.toUpperCase(), SECRET)).toBe(true);
  });

  test('rejects a wrong secret', () => {
    expect(verifyWhatnotSignature(Buffer.from(VECTOR_BODY), VECTOR_SIG, 'other_secret')).toBe(false);
  });

  test('rejects a missing signature or secret', () => {
    expect(verifyWhatnotSignature(Buffer.from(VECTOR_BODY), undefined, SECRET)).toBe(false);
    expect(verifyWhatnotSignature(Buffer.from(VECTOR_BODY), VECTOR_SIG, '')).toBe(false);
  });

  test('rejects a base64 digest (Whatnot uses hex)', () => {
    const b64 = crypto.createHmac('sha256', SECRET).update(VECTOR_BODY).digest('base64');
    expect(verifyWhatnotSignature(Buffer.from(VECTOR_BODY), b64, SECRET)).toBe(false);
  });

  test('rejects a "sha256=" prefix (Whatnot sends none)', () => {
    expect(verifyWhatnotSignature(Buffer.from(VECTOR_BODY), `sha256=${VECTOR_SIG}`, SECRET)).toBe(false);
  });

  test('rejects a truncated signature without throwing', () => {
    expect(verifyWhatnotSignature(Buffer.from(VECTOR_BODY), VECTOR_SIG.slice(0, 40), SECRET)).toBe(false);
  });

  test('rejects re-serialised JSON (verify raw bytes, not a parsed object)', () => {
    const reserialised = JSON.stringify(JSON.parse(VECTOR_BODY), null, 2);
    expect(verifyWhatnotSignature(Buffer.from(reserialised), VECTOR_SIG, SECRET)).toBe(false);
  });

  test('rejects a timestamp-prefixed signature (nothing but the body is signed)', () => {
    const withTs = sign(`2026-10-16T12:00:00Z.${VECTOR_BODY}`);
    expect(verifyWhatnotSignature(Buffer.from(VECTOR_BODY), withTs, SECRET)).toBe(false);
  });
});

describe('POST /webhooks/whatnot', () => {
  test.each(TOPICS)('accepts a signed %s event', async (topic) => {
    const body = JSON.stringify(envelope(topic));
    const res = await send(body, sign(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  test('reads X-Whatnot-Seller-Id', async () => {
    const body = JSON.stringify(envelope('product/sold'));
    const res = await send(body, sign(body), { 'X-Whatnot-Seller-Id': 'example-seller-id' });
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith('(seller example-seller-id)');
  });

  test('handles an order without read_customers data', async () => {
    const order = { ...OBJECTS['order/created'], shipping_address: undefined, tracking_info: undefined };
    const body = JSON.stringify(envelope('order/created', order));
    expect((await send(body, sign(body))).status).toBe(200);
  });

  test('returns 200 for an unknown topic (Whatnot may add topics)', async () => {
    const body = JSON.stringify(envelope('something/new', { foo: 'bar' }));
    const res = await send(body, sign(body));
    expect(res.status).toBe(200);
  });

  test('dedupes a retried event on envelope id', async () => {
    const body = JSON.stringify(envelope('order/created'));
    expect((await send(body, sign(body))).body).toEqual({ received: true });
    expect((await send(body, sign(body))).body).toEqual({ received: true, duplicate: true });
  });

  test('returns 400 when the signature header is missing', async () => {
    const body = JSON.stringify(envelope('product/sold'));
    const res = await send(body, undefined);
    expect(res.status).toBe(400);
  });

  test('returns 400 for a signature made with another secret', async () => {
    const body = JSON.stringify(envelope('product/sold'));
    const res = await send(body, sign(body, 'wrong_secret'));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('returns 400 for a tampered body', async () => {
    const body = JSON.stringify(envelope('order/created'));
    const res = await send(body.replace('26.60', '0.01'), sign(body));
    expect(res.status).toBe(400);
  });

  test('returns 400 for invalid JSON with a valid signature', async () => {
    const body = 'not json';
    const res = await send(body, sign(body));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSON');
  });

  test('returns 500 when WHATNOT_WEBHOOK_SECRET is not set', async () => {
    delete process.env.WHATNOT_WEBHOOK_SECRET;
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const body = JSON.stringify(envelope('product/sold'));
    const res = await send(body, sign(body));
    expect(res.status).toBe(500);
  });
});
