import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Set test environment variables before importing the route
beforeAll(() => {
  process.env.RAZORPAY_WEBHOOK_SECRET = 'test_razorpay_secret';
});

import { POST, verifyRazorpayWebhook } from '../app/webhooks/razorpay/route';

const webhookSecret = 'test_razorpay_secret';

/**
 * Generate a valid Razorpay signature for testing.
 * Matches Razorpay's scheme: HMAC-SHA256 (hex) over the raw body.
 */
function generateRazorpaySignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function buildEvent(event: string, entities: Record<string, unknown>): string {
  return JSON.stringify({
    entity: 'event',
    account_id: 'acc_test',
    event,
    contains: Object.keys(entities),
    payload: entities,
    created_at: 1590597321,
  });
}

function buildRequest(body: string, signature: string | null): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (signature !== null) {
    headers.set('x-razorpay-signature', signature);
  }
  return new NextRequest('http://localhost/webhooks/razorpay', {
    method: 'POST',
    headers,
    body,
  });
}

describe('verifyRazorpayWebhook', () => {
  it('should validate a correct signature', () => {
    const payload = buildEvent('payment.captured', { payment: { entity: { id: 'pay_1' } } });
    const signature = generateRazorpaySignature(payload, webhookSecret);

    expect(verifyRazorpayWebhook(payload, signature, webhookSecret)).toBe(true);
  });

  it('should reject an invalid signature', () => {
    const payload = buildEvent('payment.captured', { payment: { entity: { id: 'pay_1' } } });

    expect(verifyRazorpayWebhook(payload, 'deadbeef', webhookSecret)).toBe(false);
  });

  it('should reject a missing signature', () => {
    const payload = buildEvent('payment.captured', { payment: { entity: { id: 'pay_1' } } });

    expect(verifyRazorpayWebhook(payload, null, webhookSecret)).toBe(false);
  });

  it('should reject a tampered payload', () => {
    const original = buildEvent('payment.captured', { payment: { entity: { id: 'pay_1' } } });
    const signature = generateRazorpaySignature(original, webhookSecret);
    const tampered = buildEvent('payment.captured', { payment: { entity: { id: 'pay_999' } } });

    expect(verifyRazorpayWebhook(tampered, signature, webhookSecret)).toBe(false);
  });

  it('should reject the wrong secret', () => {
    const payload = buildEvent('payment.captured', { payment: { entity: { id: 'pay_1' } } });
    const signature = generateRazorpaySignature(payload, webhookSecret);

    expect(verifyRazorpayWebhook(payload, signature, 'wrong_secret')).toBe(false);
  });
});

describe('POST /webhooks/razorpay', () => {
  it('should return 400 for a missing signature', async () => {
    const payload = buildEvent('payment.captured', { payment: { entity: { id: 'pay_1' } } });
    const response = await POST(buildRequest(payload, null));

    expect(response.status).toBe(400);
  });

  it('should return 400 for an invalid signature', async () => {
    const payload = buildEvent('payment.captured', { payment: { entity: { id: 'pay_1' } } });
    const response = await POST(buildRequest(payload, 'deadbeef'));

    expect(response.status).toBe(400);
  });

  it('should return 200 for a valid payment.captured event', async () => {
    const payload = buildEvent('payment.captured', {
      payment: { entity: { id: 'pay_1', amount: 5000, currency: 'INR' } },
    });
    const signature = generateRazorpaySignature(payload, webhookSecret);
    const response = await POST(buildRequest(payload, signature));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
  });

  it('should handle an order.paid event', async () => {
    const payload = buildEvent('order.paid', {
      order: { entity: { id: 'order_1', amount_paid: 5000 } },
      payment: { entity: { id: 'pay_2' } },
    });
    const signature = generateRazorpaySignature(payload, webhookSecret);
    const response = await POST(buildRequest(payload, signature));

    expect(response.status).toBe(200);
  });

  it('should handle a refund.processed event', async () => {
    const payload = buildEvent('refund.processed', {
      refund: { entity: { id: 'rfnd_1', payment_id: 'pay_1' } },
      payment: { entity: { id: 'pay_1' } },
    });
    const signature = generateRazorpaySignature(payload, webhookSecret);
    const response = await POST(buildRequest(payload, signature));

    expect(response.status).toBe(200);
  });

  it('should handle a subscription.charged event', async () => {
    const payload = buildEvent('subscription.charged', {
      subscription: { entity: { id: 'sub_1' } },
      payment: { entity: { id: 'pay_3' } },
    });
    const signature = generateRazorpaySignature(payload, webhookSecret);
    const response = await POST(buildRequest(payload, signature));

    expect(response.status).toBe(200);
  });
});
