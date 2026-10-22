import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/xendit/route';
import { verifyXenditToken } from '../lib/verify-xendit';

const TOKEN = 'test_xendit_verification_token_0123456789';

beforeAll(() => {
  process.env.XENDIT_CALLBACK_TOKEN = TOKEN;
});

// Payments API webhook (has an "event" field; resource is under "data")
function paymentPayload(event = 'payment.capture') {
  return {
    event,
    business_id: '603f1c4172bbe840979fd408',
    created: '2026-08-26T07:28:23.731Z',
    data: {
      payment_id: 'py-66269236-7447-450f-b0d8-ed4255b11d8a',
      payment_request_id: 'pr-c5a38204-58a9-4968-a8ad-68a79b172a66',
      payment_token_id: 'pt-1',
      id: 'rfd-1',
      reference_id: 'order-123',
      currency: 'IDR',
      request_amount: 1234,
      status: 'SUCCEEDED',
    },
  };
}

// Invoice callback (no "event" field)
function invoicePayload(status = 'PAID') {
  return { id: 'inv-1', external_id: 'order-123', status, amount: 50000, currency: 'IDR' };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(paymentPayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/xendit', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('Xendit webhook route', () => {
  describe('x-callback-token verification', () => {
    it('accepts the correct token', async () => {
      const res = await POST(makeRequest({ 'x-callback-token': TOKEN }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('rejects a wrong token of the same length', async () => {
      const res = await POST(makeRequest({ 'x-callback-token': 'x'.repeat(TOKEN.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a token of a different length without throwing', async () => {
      const res = await POST(makeRequest({ 'x-callback-token': 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing token', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('verifies regardless of content type', async () => {
      const res = await POST(
        makeRequest({ 'x-callback-token': TOKEN }, JSON.stringify(paymentPayload()), 'text/plain')
      );
      expect(res.status).toBe(200);
    });
  });

  describe('Request handling', () => {
    it('returns 400 for an invalid JSON body', async () => {
      const res = await POST(makeRequest({ 'x-callback-token': TOKEN }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest({ 'x-callback-token': TOKEN }, '[1,2,3]'));
      expect(res.status).toBe(400);
    });

    it('does not parse the body before verifying the token', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });

    it('handles every Payments API event', async () => {
      const events = [
        'payment.capture', 'payment.authorization', 'payment.failure', 'payment.expiry',
        'payment_request.expiry', 'payment_token.activation', 'payment_token.failure',
        'payment_token.expiry', 'refund.succeeded', 'refund.failed',
      ];
      for (const event of events) {
        const res = await POST(
          makeRequest({ 'x-callback-token': TOKEN }, JSON.stringify(paymentPayload(event)))
        );
        expect(res.status).toBe(200);
      }
    });

    it('handles invoice callbacks that have no event field', async () => {
      for (const status of ['PAID', 'EXPIRED']) {
        const res = await POST(
          makeRequest({ 'x-callback-token': TOKEN }, JSON.stringify(invoicePayload(status)))
        );
        expect(res.status).toBe(200);
      }
    });

    it('acknowledges unknown events', async () => {
      const res = await POST(
        makeRequest({ 'x-callback-token': TOKEN }, JSON.stringify(paymentPayload('something.else')))
      );
      expect(res.status).toBe(200);
    });
  });

  describe('verifyXenditToken', () => {
    it('rejects everything when no token is configured', () => {
      expect(verifyXenditToken(new Headers({ 'x-callback-token': 'abc' }), '')).toBe(false);
      expect(verifyXenditToken(new Headers({ 'x-callback-token': 'abc' }), undefined)).toBe(false);
    });

    it('rejects a missing header', () => {
      expect(verifyXenditToken(new Headers(), 'abc')).toBe(false);
    });

    it('accepts an exact match', () => {
      expect(verifyXenditToken(new Headers({ 'x-callback-token': 'abc' }), 'abc')).toBe(true);
    });
  });
});
