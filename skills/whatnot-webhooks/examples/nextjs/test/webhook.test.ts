// Generated with: whatnot-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { Webhook } from 'standardwebhooks';
import { POST } from '../app/webhooks/whatnot/route';
import { verifyWhatnotWebhook, processedWebhookIds, type SignatureHeaders } from '../lib/whatnot';

// The golden vector Whatnot publishes in its webhooks guide: a real signed
// delivery and the secret that signed it. The body is the EXACT bytes Whatnot
// sent (note the spaces after ':' and ','), so it's a string literal, not
// JSON.stringify output, which is compact and would not match.
const GOLDEN = {
  secret: 'wn_wh_AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA=',
  id: '0b7e4f6c-3d1a-4a8e-9f2b-5c6d7e8f9a0b',
  timestamp: '1792512005',
  signature: 'v1,8m/VX9GLLqhNZJndMpPw7OTUKSDI4szDXAmIFY8ffBI=',
  body: '{"type": "shows.started", "timestamp": "2026-10-20T16:00:00.123Z", "data": {"show_id": "9b2f6c1e-4d3a-4f8b-a1c2-3d4e5f6a7b8c"}, "version": "v2", "seller_id": "1234567"}',
};
const SECRET = GOLDEN.secret;

/** Sign exactly like Whatnot: base64(HMAC-SHA256(key, "{id}.{timestamp}.{body}")). */
function sign(rawBody: string, id: string, timestamp: string, secret = SECRET): string {
  const key = Buffer.from(secret.replace(/^wn_wh_/, ''), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`, 'utf8').digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);

interface SignOptions {
  id?: string;
  timestamp?: number | string;
  secret?: string;
}

function signedHeaders(rawBody: string, opts: SignOptions = {}): Record<string, string> {
  const id = opts.id || crypto.randomUUID();
  const ts = String(opts.timestamp ?? now());
  return {
    'webhook-id': id,
    'webhook-timestamp': ts,
    'webhook-signature': sign(rawBody, id, ts, opts.secret),
  };
}

async function post(rawBody: string, headers: Record<string, string>) {
  const req = new NextRequest('http://localhost:3000/webhooks/whatnot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: rawBody,
  });
  const res = await POST(req);
  return { status: res.status, body: await res.json() };
}

/*
 * ILLUSTRATIVE payloads. Field names and shapes follow Whatnot's webhooks
 * OpenAPI description; the values are made up. Bodies are serialised with
 * spaces, the way Whatnot sends them.
 */
const money = (amount: string) => ({ amount, currency: 'USD' });
const body = (type: string, data: Record<string, unknown>) =>
  JSON.stringify({ type, timestamp: '2026-10-20T16:00:00.123Z', data, version: 'v2', seller_id: '1234567' })
    .replace(/":/g, '": ')
    .replace(/,"/g, ', "');

const ORDER = {
  id: 'ord_example_1',
  status: 'pending_fulfillment',
  show_id: '9b2f6c1e-4d3a-4f8b-a1c2-3d4e5f6a7b8c',
  transaction_type: 'auction',
  buyer: { id: 'usr_example_1', username: 'cardcollector', display_name: null },
  amounts: {
    subtotal: money('40.00'),
    shipping: money('5.00'),
    tax: money('4.77'),
    applied_discount: null,
    total: money('49.77'),
  },
  created_at: '2026-10-20T16:05:00.000Z',
  updated_at: '2026-10-20T16:05:00.000Z',
  cancelled_at: null,
};

const DATA: Record<string, Record<string, unknown>> = {
  'orders.created': ORDER,
  'orders.updated': { ...ORDER, status: 'cancelled', buyer: null, cancelled_at: '2026-10-20T17:00:00.000Z' },
  'shows.created': { id: 'show_example_1', title: 'Friday card breaks', status: 'scheduled' },
  'shows.updated': { id: 'show_example_1', title: 'Friday card breaks', status: 'scheduled' },
  'shows.started': { show_id: 'show_example_1' },
  'shows.ended': { show_id: 'show_example_1' },
  'shows.cancelled': { show_id: 'show_example_1' },
  'merchandising.products.added_to_show': { product_id: 'prd_example_1', show_id: 'show_example_1' },
  'merchandising.products.removed_from_show': { product_id: 'prd_example_1', show_id: 'show_example_1' },
  'shipments.created': { id: 'shp_example_1', status: 'created', recipient: null, documents: null },
  'shipments.label_generated': {
    shipment_id: 'shp_example_1',
    reason: 'generated',
    tracking: { carrier: 'usps', service: 'usps_ground_advantage', tracking_code: '9400100000000000000000', last_mile_tracking_code: null },
    documents: null, // null without read:customers
  },
  'shipments.tracking_code_added': {
    shipment_id: 'shp_example_1',
    tracking: { carrier: 'usps', service: null, tracking_code: '9400100000000000000000', last_mile_tracking_code: null },
  },
  'shipments.parcel_updated': { shipment_id: 'shp_example_1', weight: { value: 8, unit: 'ounce' } },
  'shipments.items.added': { shipment_id: 'shp_example_1', shipment_item_ids: ['itm_1', 'itm_2'] },
  'shipments.items.removed': { shipment_id: 'shp_example_1', shipment_item_ids: ['itm_1'] },
  'products.created': { id: 'prd_example_1', title: 'Holo rare' },
  'products.updated': { id: 'prd_example_1', title: 'Holo rare (PSA 10)' },
  'products.deleted': { id: 'prd_example_1' },
};

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  process.env.WHATNOT_WEBHOOK_SECRET = SECRET;
  processedWebhookIds.clear();
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('golden vector from the Whatnot docs', () => {
  const headers: SignatureHeaders = {
    'webhook-id': GOLDEN.id,
    'webhook-timestamp': GOLDEN.timestamp,
    'webhook-signature': GOLDEN.signature,
  };

  // Freeze only Date at the vector's timestamp so the 5-minute check passes.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Number(GOLDEN.timestamp) * 1000);
  });

  test('our signer reproduces the published signature', () => {
    expect(sign(GOLDEN.body, GOLDEN.id, GOLDEN.timestamp)).toBe(GOLDEN.signature);
  });

  test('verifyWhatnotWebhook accepts it', () => {
    expect(verifyWhatnotWebhook(GOLDEN.body, headers)).toMatchObject({ type: 'shows.started', seller_id: '1234567' });
  });

  test('the endpoint accepts it', async () => {
    const res = await post(GOLDEN.body, headers);
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('shows.started: show 9b2f6c1e-4d3a-4f8b-a1c2-3d4e5f6a7b8c');
  });

  test('fails if the wn_wh_ prefix is not stripped before the library sees it', () => {
    expect(() => new Webhook(GOLDEN.secret).verify(GOLDEN.body, headers)).toThrow();
  });

  test('fails on re-serialised (compact) JSON', () => {
    expect(() => verifyWhatnotWebhook(JSON.stringify(JSON.parse(GOLDEN.body)), headers)).toThrow();
  });

  test('accepts a space-separated list where only one entry is valid', async () => {
    const rotated = `v1,${Buffer.alloc(32).toString('base64')} ${GOLDEN.signature}`;
    const res = await post(GOLDEN.body, { ...headers, 'webhook-signature': rotated });
    expect(res.status).toBe(200);
  });

  test('rejects the vector once the clock is past the 5-minute tolerance', async () => {
    vi.setSystemTime((Number(GOLDEN.timestamp) + 301) * 1000);
    const res = await post(GOLDEN.body, headers);
    expect(res.status).toBe(400);
  });
});

describe('POST /webhooks/whatnot', () => {
  test.each(Object.keys(DATA))('accepts a signed %s event', async (type) => {
    const raw = body(type, DATA[type]);
    const res = await post(raw, signedHeaders(raw));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  test('logs the seller_id from the signed body', async () => {
    const raw = body('orders.created', ORDER);
    await post(raw, signedHeaders(raw));
    expect(logSpy).toHaveBeenCalledWith('(seller 1234567)');
  });

  test('handles an order without read:customers (buyer is null)', async () => {
    const raw = body('orders.created', { ...ORDER, buyer: null });
    expect((await post(raw, signedHeaders(raw))).status).toBe(200);
  });

  test('acknowledges an unknown type (Whatnot adds topics over time)', async () => {
    const raw = body('something.new', { foo: 'bar' });
    const res = await post(raw, signedHeaders(raw));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Unhandled Whatnot event type: something.new');
  });

  test('dedupes a retry on the webhook-id header', async () => {
    const raw = body('orders.created', ORDER);
    const id = crypto.randomUUID();
    expect((await post(raw, signedHeaders(raw, { id }))).body).toEqual({ received: true });
    // A retry is re-signed with a fresh timestamp but keeps the same webhook-id.
    const retry = signedHeaders(raw, { id, timestamp: now() + 30 });
    expect((await post(raw, retry)).body).toEqual({ received: true, duplicate: true });
  });

  test.each(['webhook-id', 'webhook-timestamp', 'webhook-signature'])('returns 400 when %s is missing', async (name) => {
    const raw = body('orders.created', ORDER);
    const headers = signedHeaders(raw);
    delete headers[name];
    expect((await post(raw, headers)).status).toBe(400);
  });

  test('returns 400 for the legacy X-Whatnot-Webhook-Signature scheme', async () => {
    const raw = body('orders.created', ORDER);
    const hex = crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
    expect((await post(raw, { 'X-Whatnot-Webhook-Signature': hex })).status).toBe(400);
  });

  test('returns 400 for a stale timestamp', async () => {
    const raw = body('orders.created', ORDER);
    const res = await post(raw, signedHeaders(raw, { timestamp: now() - 6 * 60 }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('returns 400 for a signature made with another secret', async () => {
    const raw = body('orders.created', ORDER);
    const other = `wn_wh_${Buffer.alloc(32, 7).toString('base64')}`;
    expect((await post(raw, signedHeaders(raw, { secret: other }))).status).toBe(400);
  });

  test('returns 400 for a tampered body', async () => {
    const raw = body('orders.created', ORDER);
    const headers = signedHeaders(raw);
    expect((await post(raw.replace('49.77', '0.01'), headers)).status).toBe(400);
  });

  test('works when the secret is configured without its wn_wh_ prefix', async () => {
    process.env.WHATNOT_WEBHOOK_SECRET = SECRET.slice('wn_wh_'.length);
    const raw = body('orders.created', ORDER);
    expect((await post(raw, signedHeaders(raw))).status).toBe(200);
  });

  test('returns 500 when WHATNOT_WEBHOOK_SECRET is not set', async () => {
    delete process.env.WHATNOT_WEBHOOK_SECRET;
    const raw = body('orders.created', ORDER);
    expect((await post(raw, signedHeaders(raw))).status).toBe(500);
  });
});
