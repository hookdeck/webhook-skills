import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/violet/route';
import { verifyVioletSignature } from '../lib/violet';

// Violet app secrets are 32 hex characters, used as UTF-8 (never hex-decoded)
const SECRET = '3c989fdb913d4dd99e832b08cf207102';

// Payloads based on the sample bodies in Violet's webhook docs
const merchantEnabled = {
  id: 10189,
  name: 'sample-store',
  platform: 'SHOPIFY',
  store_url: 'sample-store.myshopify.com',
  status: 'ACTIVE',
  default_currency: 'USD',
  connection_status: 'CONNECTED',
};
const transferSent = {
  id: 335500,
  payment_provider_id: 'tr_3RBesbK29KDiBVld0zLcELFW',
  payout_account_id: 11495,
  amount: 11428,
  currency: 'USD',
  status: 'SENT',
  payment_provider: 'STRIPE',
  related_orders: ['8035507'],
  errors: [],
};
const order = { id: 8035507, status: 'COMPLETED', currency: 'USD' };

// Violet signs only the raw body bytes: base64(HMAC-SHA256(secret, body))
function sign(body: string, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('base64');
}

interface Options {
  topic?: string | null;
  signature?: string | null;
  contentType?: string;
}

function send(body: string, { topic = 'ORDER_UPDATED', signature = sign(body), contentType = 'application/json' }: Options = {}) {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (topic !== null) headers['x-violet-topic'] = topic;
  if (signature !== null) headers['x-violet-hmac'] = signature;
  return POST(new NextRequest('http://localhost:3000/webhooks/violet', { method: 'POST', headers, body }));
}

// The 43rd character carries 4 digest bits and 2 stray bits: change only the stray bits
function withStrayBits(signature: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const index = alphabet.indexOf(signature[42]);
  const altered = alphabet[(index & ~3) | ((index + 1) & 3)];
  return signature.slice(0, 42) + altered + '=';
}

beforeAll(() => {
  process.env.VIOLET_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env.VIOLET_WEBHOOK_SECRET = SECRET;
});

describe('Violet webhook route', () => {
  it('accepts a MERCHANT_ENABLED event with a valid signature', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await send(JSON.stringify(merchantEnabled), { topic: 'MERCHANT_ENABLED' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(log).toHaveBeenCalledWith('MERCHANT_ENABLED: merchant 10189 "sample-store" (ACTIVE)');
  });

  it('accepts a TRANSFER_SENT event', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await send(JSON.stringify(transferSent), { topic: 'TRANSFER_SENT' });
    expect(res.status).toBe(200);
    expect(log).toHaveBeenCalledWith('TRANSFER_SENT: transfer 335500 11428 USD (SENT)');
  });

  it('accepts ORDER_COMPLETED and ORDER_SHIPPED events', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    for (const topic of ['ORDER_COMPLETED', 'ORDER_SHIPPED']) {
      expect((await send(JSON.stringify(order), { topic })).status).toBe(200);
    }
    expect(log).toHaveBeenCalledWith('ORDER_COMPLETED: order 8035507 (COMPLETED)');
  });

  it('verifies the exact bytes received, not a re-serialised body', async () => {
    const raw = '{\n  "id": 1,\n  "status":   "ACTIVE",  "note": "café ☃"\n}';
    expect((await send(raw)).status).toBe(200);
  });

  it('accepts any content type', async () => {
    expect((await send(JSON.stringify(order), { contentType: 'text/plain' })).status).toBe(200);
  });

  it('logs and accepts topics it does not handle', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await send(JSON.stringify({ id: 5 }), { topic: 'PRODUCT_SYNC_COMPLETED' });
    expect(res.status).toBe(200);
    expect(log).toHaveBeenCalledWith('Unhandled Violet topic: PRODUCT_SYNC_COMPLETED');
  });

  it('rejects a missing or empty signature with 401', async () => {
    const raw = JSON.stringify(order);
    expect((await send(raw, { signature: null })).status).toBe(401);
    expect((await send(raw, { signature: '' })).status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const raw = JSON.stringify(order);
    expect((await send(raw, { signature: sign(raw, 'another-secret') })).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const raw = JSON.stringify(order);
    expect((await send(raw.replace('COMPLETED', 'FAILED'), { signature: sign(raw) })).status).toBe(401);
  });

  it('does not hex-decode the secret', async () => {
    const raw = JSON.stringify(order);
    const signature = crypto.createHmac('sha256', Buffer.from(SECRET, 'hex')).update(raw).digest('base64');
    expect((await send(raw, { signature })).status).toBe(401);
  });

  it('rejects a hex digest and a prefixed value', async () => {
    const raw = JSON.stringify(order);
    const hex = crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
    expect((await send(raw, { signature: hex })).status).toBe(401);
    expect((await send(raw, { signature: `sha256=${sign(raw)}` })).status).toBe(401);
  });

  it('rejects an unpadded or trailing-junk base64 value', async () => {
    const raw = JSON.stringify(order);
    const good = sign(raw);
    expect((await send(raw, { signature: good.slice(0, -1) })).status).toBe(401);
    expect((await send(raw, { signature: `${good}x` })).status).toBe(401);
  });

  it('rejects a base64 value whose last character carries stray low bits', async () => {
    const raw = JSON.stringify(order);
    const good = sign(raw);
    const stray = withStrayBits(good);
    // It decodes to the same digest bytes...
    expect(Buffer.from(stray, 'base64').equals(Buffer.from(good, 'base64'))).toBe(true);
    expect(stray).not.toBe(good);
    // ...but is not the string Violet sends, so it is rejected
    expect((await send(raw, { signature: stray })).status).toBe(401);
  });

  it('returns 400 when X-Violet-Topic is missing', async () => {
    expect((await send(JSON.stringify(order), { topic: null })).status).toBe(400);
  });

  it('returns 400 for invalid JSON with a valid signature', async () => {
    expect((await send('not json')).status).toBe(400);
  });

  it('returns 400 when the body is not a JSON object', async () => {
    for (const raw of ['null', '[1,2]', '42', '"text"']) {
      expect((await send(raw)).status).toBe(400);
    }
  });

  it('ignores wrong-typed fields instead of failing', async () => {
    const weird = JSON.stringify({ id: { nested: true }, status: ['ACTIVE'], name: 7, amount: '11428', currency: null });
    for (const topic of ['ORDER_UPDATED', 'MERCHANT_ENABLED', 'TRANSFER_SENT']) {
      expect((await send(weird, { topic })).status).toBe(200);
    }
  });

  it('returns 500 when the secret is not configured', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    delete process.env.VIOLET_WEBHOOK_SECRET;
    expect((await send(JSON.stringify(order))).status).toBe(500);
  });
});

describe('verifyVioletSignature', () => {
  it('accepts only a string header holding the exact digest', () => {
    const body = Buffer.from('{"id":1}');
    expect(verifyVioletSignature(body, sign(body.toString()), SECRET)).toBe(true);
    expect(verifyVioletSignature(body, undefined, SECRET)).toBe(false);
    expect(verifyVioletSignature(body, null, SECRET)).toBe(false);
  });
});
