import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/doordash-drive/route';
import { classify, verifyDoorDashDriveRequest } from '../lib/verify-doordash-drive';

// Whatever text is entered in the Developer Portal is sent verbatim; here a "Bearer"-style value
const CRED = 'Bearer ddk_9f2c1a7e4b6d4e0c8a31';

beforeAll(() => {
  process.env.DOORDASH_DRIVE_AUTHORIZATION = CRED;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

// Shape from DoorDash's documented example payload (trimmed)
const delivery = (event_name: string) => ({
  created_at: '2022-02-01T23:18:22.791883Z',
  event_name,
  external_delivery_id: 'c19a5d37-e457-4247-9a67-921ec0134125',
  dasher_id: 123212,
  dasher_name: 'John D.',
  dasher_location: { lat: 43.333333333, lng: -79.333333333 },
});
// Refund webhooks have no event_name
const refund = {
  event_data: {
    reason: 'delivered_late',
    reason_comments: 'order_ready_dasher_late_time_period_1',
    amount: '750',
    currency_code: 'USD',
    order_details: { order_value: 5000, tip: 200, delivery_charge: 599 },
  },
};

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(delivery('DASHER_CONFIRMED')),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/doordash-drive', {
    method: 'POST',
    headers: { 'Content-Type': contentType, ...headers },
    body,
  });
}

describe('DoorDash Drive webhook route', () => {
  it('accepts the full Authorization header value', async () => {
    const res = await POST(makeRequest({ Authorization: CRED }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('rejects a missing Authorization header', async () => {
    expect((await POST(makeRequest())).status).toBe(401);
  });

  it('rejects a wrong credential', async () => {
    expect((await POST(makeRequest({ Authorization: 'Bearer nope' }))).status).toBe(401);
  });

  it('does not strip the scheme prefix', async () => {
    const res = await POST(makeRequest({ Authorization: CRED.replace('Bearer ', '') }));
    expect(res.status).toBe(401);
  });

  it('accepts a bare token credential without decoding it as Basic', async () => {
    process.env.DOORDASH_DRIVE_AUTHORIZATION = 'my-bare-token';
    const res = await POST(makeRequest({ Authorization: 'my-bare-token' }));
    process.env.DOORDASH_DRIVE_AUTHORIZATION = CRED;
    expect(res.status).toBe(200);
  });

  it('rejects a credential that differs only in length', async () => {
    expect((await POST(makeRequest({ Authorization: CRED + 'x' }))).status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await POST(makeRequest({ Authorization: CRED }, JSON.stringify(delivery('DASHER_DROPPED_OFF')), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await POST(makeRequest({ Authorization: CRED }, 'not json'))).status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    expect((await POST(makeRequest({ Authorization: CRED }, '[1,2]'))).status).toBe(400);
  });

  it('accepts every documented delivery event, refunds and enroute events', async () => {
    const names = [
      'DASHER_CONFIRMED', 'DASHER_CONFIRMED_PICKUP_ARRIVAL', 'DASHER_PICKED_UP',
      'DASHER_CONFIRMED_DROPOFF_ARRIVAL', 'DASHER_DROPPED_OFF', 'DELIVERY_CANCELLED',
      'DELIVERY_RETURN_INITIALIZED', 'DASHER_CONFIRMED_RETURN_ARRIVAL', 'DELIVERY_RETURNED',
      'DELIVERY_BATCHED', 'dasher_enroute_to_pickup', 'dasher_enroute_to_dropoff',
      'dasher_enroute_to_return',
    ];
    for (const n of names) {
      expect((await POST(makeRequest({ Authorization: CRED }, JSON.stringify(delivery(n))))).status).toBe(200);
    }
    expect((await POST(makeRequest({ Authorization: CRED }, JSON.stringify(refund)))).status).toBe(200);
  });
});

describe('helpers', () => {
  it('classifies delivery, refund and unknown payloads', () => {
    expect(classify(delivery('DASHER_PICKED_UP'))).toBe('DASHER_PICKED_UP');
    expect(classify(refund)).toBe('refund');
    expect(classify({ foo: 1 })).toBeNull();
  });

  it('never accepts when DOORDASH_DRIVE_AUTHORIZATION is unset', () => {
    expect(verifyDoorDashDriveRequest(new Headers({ Authorization: 'x' }), {})).toBe(false);
    expect(verifyDoorDashDriveRequest(new Headers({ Authorization: '' }), { DOORDASH_DRIVE_AUTHORIZATION: '' })).toBe(false);
  });
});
