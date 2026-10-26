// Generated with: cashfree-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/cashfree/route';
import { verifyCashfreeSignature } from '../lib/verify';

// Cashfree uses the client secret as-is (UTF-8), not a decoded whsec_ value.
const SECRET = 'cfsk_ma_test_0123456789abcdef0123456789abcdef_01234567';

/** Sign like Cashfree: base64(HMAC-SHA256(timestamp + rawBody, secret)). */
function sign(rawBody: string, timestamp: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(timestamp + rawBody).digest('base64');
}

const paymentSuccess = {
  data: {
    order: { order_id: 'order_1234', order_amount: 500.0, order_currency: 'INR', order_tags: null },
    payment: {
      cf_payment_id: 9876543210,
      payment_status: 'SUCCESS',
      payment_amount: 500.0,
      payment_currency: 'INR',
      payment_method: { upi: { channel: 'collect', upi_id: 'user@upi' } },
    },
    customer_details: { customer_name: 'John Doe', customer_id: 'CUST001' },
  },
  event_time: '2024-01-15T10:30:05+05:30',
  type: 'PAYMENT_SUCCESS',
};
const transferSuccess = {
  data: { transfer_id: 'JUNOB2018', cf_transfer_id: '123456', status: 'SUCCESS', transfer_amount: 1 },
  event_time: '2024-07-25T17:43:37',
  type: 'TRANSFER_SUCCESS',
};
const bankVerification = {
  event_type: 'BANK_ACCOUNT_VERIFICATION_SUCCESS',
  event_time: '2023-07-19 10:46:16',
  version: 'v2',
  data: { reference_id: 1294785793, account_status: 'VALID', name_at_bank: 'John Doe' },
};
const ppiCredit = {
  event_type: 'PPI_CREDIT_SUCCESS',
  event_time: '2006-01-02T15:04:05Z',
  data: { credit_id: 'CREDIT126345', wallet_id: 'WALLET936721', amount: 100.5, status: 'SUCCESS' },
};

const ts = () => String(Math.floor(Date.now() / 1000));

interface PostOptions {
  timestamp?: string | null;
  signature?: string | null;
  secret?: string;
  contentType?: string;
}

function post(rawBody: string, opts: PostOptions = {}) {
  const timestamp = opts.timestamp === undefined ? ts() : opts.timestamp;
  const headers: Record<string, string> = { 'content-type': opts.contentType ?? 'application/json' };
  if (timestamp !== null) headers['x-webhook-timestamp'] = timestamp;
  const signature =
    opts.signature !== undefined ? opts.signature : sign(rawBody, timestamp ?? '', opts.secret);
  if (signature !== null) headers['x-webhook-signature'] = signature;
  return POST(
    new NextRequest('http://localhost:3000/webhooks/cashfree', { method: 'POST', headers, body: rawBody })
  );
}

describe('Cashfree webhook route', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.CASHFREE_WEBHOOK_SECRET = SECRET;
    delete process.env.CASHFREE_WEBHOOK_TOLERANCE_SECONDS;
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['Payment Gateway (type)', paymentSuccess],
    ['Payouts V2 (type)', transferSuccess],
    ['Secure ID (event_type)', bankVerification],
    ['PPI (event_type)', ppiCredit],
  ])('accepts a valid %s delivery with 200', async (_label, payload) => {
    const res = await post(JSON.stringify(payload));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    const logged = (console.log as any).mock.calls.flat().join('\n');
    expect(logged).not.toMatch(/Unhandled/);
  });

  it('verifies the exact raw bytes, including pretty-printed bodies', async () => {
    expect((await post(JSON.stringify(paymentSuccess, null, 4))).status).toBe(200);
  });

  it('verifies non-JSON content types', async () => {
    expect((await post(JSON.stringify(transferSuccess), { contentType: 'text/plain' })).status).toBe(200);
  });

  it('puts the timestamp first with no separator', () => {
    const body = JSON.stringify(ppiCredit);
    const raw = Buffer.from(body);
    const good = sign(body, '1700000000');
    const withDot = crypto.createHmac('sha256', SECRET).update(`1700000000.${body}`).digest('base64');
    const bodyFirst = crypto.createHmac('sha256', SECRET).update(`${body}1700000000`).digest('base64');
    expect(verifyCashfreeSignature(raw, good, '1700000000', SECRET).ok).toBe(true);
    expect(verifyCashfreeSignature(raw, withDot, '1700000000', SECRET).ok).toBe(false);
    expect(verifyCashfreeSignature(raw, bodyFirst, '1700000000', SECRET).ok).toBe(false);
  });

  it('rejects a tampered body with 401', async () => {
    const body = JSON.stringify(paymentSuccess);
    const timestamp = ts();
    const res = await post(body.replace('500', '900'), { timestamp, signature: sign(body, timestamp) });
    expect(res.status).toBe(401);
  });

  it('rejects a different timestamp than the one signed', async () => {
    const body = JSON.stringify(paymentSuccess);
    const res = await post(body, { timestamp: '1700000001', signature: sign(body, '1700000000') });
    expect(res.status).toBe(401);
  });

  it('rejects a signature made with another secret', async () => {
    expect((await post(JSON.stringify(paymentSuccess), { secret: 'another_client_secret' })).status).toBe(401);
  });

  it('rejects missing signature or timestamp headers', async () => {
    const body = JSON.stringify(paymentSuccess);
    expect((await post(body, { signature: null })).status).toBe(401);
    expect((await post(body, { timestamp: null, signature: sign(body, '1') })).status).toBe(401);
    expect((await post(body, { signature: '' })).status).toBe(401);
  });

  it('rejects malformed signatures without decoding them', async () => {
    const body = JSON.stringify(paymentSuccess);
    const timestamp = ts();
    const good = sign(body, timestamp);
    const hex = crypto.createHmac('sha256', SECRET).update(timestamp + body).digest('hex');
    for (const bad of [hex, good.slice(0, -1), `${good}=`, `sha256=${good}`, `${good.slice(0, -2)}!=`]) {
      expect((await post(body, { timestamp, signature: bad })).status).toBe(401);
    }
  });

  it('compares base64 case-sensitively', async () => {
    const body = JSON.stringify(paymentSuccess);
    const timestamp = ts();
    expect((await post(body, { timestamp, signature: sign(body, timestamp).toLowerCase() })).status).toBe(401);
  });

  it('does not reject old timestamps by default', async () => {
    expect((await post(JSON.stringify(paymentSuccess), { timestamp: '1500000000' })).status).toBe(200);
  });

  describe('opt-in tolerance', () => {
    it('rejects an old timestamp when CASHFREE_WEBHOOK_TOLERANCE_SECONDS is set', async () => {
      process.env.CASHFREE_WEBHOOK_TOLERANCE_SECONDS = '300';
      expect((await post(JSON.stringify(paymentSuccess), { timestamp: '1500000000' })).status).toBe(401);
    });

    it('accepts a fresh timestamp in seconds or milliseconds', async () => {
      process.env.CASHFREE_WEBHOOK_TOLERANCE_SECONDS = '300';
      expect((await post(JSON.stringify(paymentSuccess))).status).toBe(200);
      expect((await post(JSON.stringify(paymentSuccess), { timestamp: String(Date.now()) })).status).toBe(200);
    });

    it('treats 0 as off', async () => {
      process.env.CASHFREE_WEBHOOK_TOLERANCE_SECONDS = '0';
      expect((await post(JSON.stringify(paymentSuccess), { timestamp: '1500000000' })).status).toBe(200);
    });
  });

  it('returns 400 for a validly signed body that is not JSON', async () => {
    expect((await post('not json', { contentType: 'text/plain' })).status).toBe(400);
  });

  it('fails closed with 500 when no secret is configured', async () => {
    delete process.env.CASHFREE_WEBHOOK_SECRET;
    expect((await post(JSON.stringify(paymentSuccess))).status).toBe(500);
  });

  it('acknowledges unhandled event types with 200', async () => {
    expect((await post(JSON.stringify({ type: 'SUBSCRIPTION_STATUS_CHANGED', data: {} }))).status).toBe(200);
  });
});
