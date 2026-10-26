import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/payjp/route';
import { verifyPayjpRequest, seenEvents } from '../lib/verify-payjp';

const TOKEN = 'whook_a09d5c1c87be4e1590a9f16516';
const HEADER = 'X-Payjp-Webhook-Token';

const EVENTS = [
  'charge.succeeded', 'charge.failed', 'charge.updated', 'charge.refunded', 'charge.captured',
  'dispute.created', 'customer.created', 'customer.updated', 'customer.deleted',
  'subscription.created', 'subscription.renewed', 'subscription.canceled', 'transfer.succeeded',
];

beforeAll(() => {
  process.env.PAYJP_WEBHOOK_SECRET = TOKEN;
});

beforeEach(() => seenEvents.clear());

let counter = 0;

// Based on the charge.succeeded example in PAY.JP's webhook guide.
function samplePayload(type = 'charge.succeeded', id = `evnt_test_${++counter}`) {
  return {
    created: 1442212986,
    data: {
      amount: 5000,
      amount_refunded: 0,
      captured: true,
      captured_at: 1442212986,
      card: { brand: 'Visa', id: 'car_f0984a6f68a730b7e1814ceabfe1', last4: '4242', object: 'card' },
      created: 1442212986,
      currency: 'jpy',
      customer: null,
      failure_code: null,
      id: 'ch_bcb7776459913c743c20e9f9351d4',
      livemode: false,
      object: 'charge',
      paid: true,
      refunded: false,
      subscription: null,
    },
    id,
    livemode: false,
    object: 'event',
    pending_webhooks: 1,
    type,
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/payjp', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/payjp', () => {
  describe('X-Payjp-Webhook-Token verification', () => {
    it('accepts the correct token', async () => {
      const res = await POST(makeRequest({ [HEADER]: TOKEN }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ 'x-payjp-webhook-token': TOKEN }));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong token of the same length', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'x'.repeat(TOKEN.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a token of a different length without throwing', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a token with extra characters (whole value is compared)', async () => {
      const res = await POST(makeRequest({ [HEADER]: `${TOKEN}-extra` }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing token', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('does not accept the token as an Authorization bearer', async () => {
      const res = await POST(makeRequest({ Authorization: `Bearer ${TOKEN}` }));
      expect(res.status).toBe(401);
    });

    it('rejects everything when no secret is configured', () => {
      const headers = new Headers({ [HEADER]: TOKEN });
      expect(verifyPayjpRequest(headers, '')).toBe(false);
      expect(verifyPayjpRequest(headers, null as unknown as string)).toBe(false);
    });

    it('verifies directly against a given secret', () => {
      expect(verifyPayjpRequest(new Headers({ [HEADER]: TOKEN }), TOKEN)).toBe(true);
      expect(verifyPayjpRequest(new Headers({ [HEADER]: 'nope' }), TOKEN)).toBe(false);
      expect(verifyPayjpRequest(new Headers(), TOKEN)).toBe(false);
    });
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const res = await POST(makeRequest({ [HEADER]: TOKEN }, JSON.stringify(samplePayload()), 'text/plain'));
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ [HEADER]: TOKEN }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a JSON value that is not an event', async () => {
      const res = await POST(makeRequest({ [HEADER]: TOKEN }, JSON.stringify([1, 2])));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for a bad token with an invalid body', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('event handling', () => {
    it.each(EVENTS)('handles %s', async (type) => {
      const res = await POST(makeRequest({ [HEADER]: TOKEN }, JSON.stringify(samplePayload(type))));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('returns 200 for an unhandled event type', async () => {
      const res = await POST(makeRequest({ [HEADER]: TOKEN }, JSON.stringify(samplePayload('plan.created'))));
      expect(res.status).toBe(200);
    });

    it('dedupes a repeated event id', async () => {
      const body = JSON.stringify(samplePayload('charge.succeeded', 'evnt_dup'));
      const first = await POST(makeRequest({ [HEADER]: TOKEN }, body));
      const second = await POST(makeRequest({ [HEADER]: TOKEN }, body));
      expect(await first.json()).toEqual({ received: true });
      expect(second.status).toBe(200);
      expect(await second.json()).toEqual({ received: true, duplicate: true });
    });
  });
});
