import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/checkout-page/route';
import { verifyCheckoutPageWebhook } from '../lib/verify';

// Checkout Page signing secrets are used as plain UTF-8 bytes
const secret = 'test_checkout_page_signing_secret';

/** Generate a Checkout Page signature: hex(HMAC-SHA256(secret, rawBody)). */
function digest(payload: string, key: string = secret): string {
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}
const sign = (payload: string, key?: string) => `sha256=${digest(payload, key)}`;

let counter = 0;
function makeEvent(event: string, data: Record<string, unknown> = {}): string {
  counter += 1;
  return JSON.stringify({
    sellerId: 'seller_123',
    timestamp: '2026-01-01T00:00:00.000Z',
    eventId: `evt_${counter}`,
    event,
    data,
  });
}

function post(body: string, signature?: string): Promise<Response> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-webhook-timestamp': '1767225600',
    'x-webhook-delivery-attempt': '1',
  };
  if (signature !== undefined) headers['x-webhook-signature'] = signature;
  return POST(
    new NextRequest('http://localhost/webhooks/checkout-page', { method: 'POST', headers, body })
  );
}

beforeEach(() => {
  process.env.CHECKOUT_PAGE_WEBHOOK_SECRET = secret;
});

describe('verifyCheckoutPageWebhook', () => {
  const body = makeEvent('payment.paid', { payment: { id: 'pay_1' } });
  const buf = Buffer.from(body);

  it('accepts sha256=<hex>, the bare digest and uppercase hex', () => {
    expect(verifyCheckoutPageWebhook(buf, sign(body), secret)).toBe(true);
    expect(verifyCheckoutPageWebhook(buf, digest(body), secret)).toBe(true);
    expect(verifyCheckoutPageWebhook(buf, `sha256=${digest(body).toUpperCase()}`, secret)).toBe(true);
  });

  it('rejects the wrong secret and tampered bodies', () => {
    expect(verifyCheckoutPageWebhook(buf, sign(body, 'wrong'), secret)).toBe(false);
    expect(verifyCheckoutPageWebhook(Buffer.from(body.replace('pay_1', 'pay_2')), sign(body), secret)).toBe(false);
  });

  it('rejects malformed values', () => {
    const d = digest(body);
    expect(verifyCheckoutPageWebhook(buf, `sha256=${d.slice(0, 62)}`, secret)).toBe(false);
    expect(verifyCheckoutPageWebhook(buf, `sha256=${d}00`, secret)).toBe(false);
    expect(verifyCheckoutPageWebhook(buf, `sha256=${d.slice(0, 63)}z`, secret)).toBe(false);
    expect(verifyCheckoutPageWebhook(buf, `sha512=${d}`, secret)).toBe(false);
    expect(verifyCheckoutPageWebhook(buf, '', secret)).toBe(false);
    expect(verifyCheckoutPageWebhook(buf, null, secret)).toBe(false);
    expect(verifyCheckoutPageWebhook(buf, sign(body), undefined)).toBe(false);
  });
});

describe('POST /webhooks/checkout-page', () => {
  it('returns 401 when the signature header is missing', async () => {
    const res = await post(makeEvent('payment.paid'));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Missing signature header');
  });

  it('returns 401 for an invalid or malformed signature', async () => {
    const body = makeEvent('payment.paid');
    expect((await post(body, `sha256=${'a'.repeat(64)}`)).status).toBe(401);
    expect((await post(body, 'not-a-signature')).status).toBe(401);
  });

  it.each([
    ['payment.paid'],
    ['payment.created'],
    ['payment.abandoned'],
    ['booking.created'],
    ['booking.paid'],
    ['subscription.created'],
    ['subscription.canceled'],
    ['customer.created'],
    ['submission.created'],
    ['product.updated'],
  ])('returns 200 for a signed %s event', async (event) => {
    const body = makeEvent(event);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('dedupes retries on eventId', async () => {
    const body = makeEvent('payment.paid');
    await post(body, sign(body));
    const second = await post(body, sign(body));
    expect(await second.json()).toEqual({ received: true, duplicate: true });
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await post(body, sign(body));
    expect(res.status).toBe(400);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.CHECKOUT_PAGE_WEBHOOK_SECRET;
    const body = makeEvent('payment.paid');
    const res = await post(body, sign(body));
    expect(res.status).toBe(500);
  });
});
