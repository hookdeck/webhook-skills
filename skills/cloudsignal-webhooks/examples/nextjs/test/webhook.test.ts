import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { verifyApiKey, KNOWN_EVENT_TYPES, POST } from '../app/webhooks/cloudsignal/route';

const APIKEY = 'test_webhook_apikey_13b3f8a9c2';

beforeAll(() => {
  process.env.CLOUDSIGNAL_WEBHOOK_APIKEY = APIKEY;
});

// A representative CloudSignal signal body. The apikey is carried IN the body.
function signal(overrides: Record<string, unknown> = {}) {
  return {
    apikey: APIKEY,
    type: 'CloudprinterOrderValidated',
    order: '73O1230A',
    order_reference: 'ref-order-123',
    item: '73O1230A-1',
    item_reference: 'ref-item-1',
    datetime: '2017-01-21T13:23:42+00:00',
    ...overrides,
  };
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/cloudsignal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('verifyApiKey', () => {
  it('returns true when the key matches', () => {
    expect(verifyApiKey(APIKEY, APIKEY)).toBe(true);
  });

  it('returns false for a wrong key', () => {
    expect(verifyApiKey('nope', APIKEY)).toBe(false);
  });

  it('returns false for a missing provided key', () => {
    expect(verifyApiKey(undefined, APIKEY)).toBe(false);
  });

  it('returns false for a missing expected key', () => {
    expect(verifyApiKey(APIKEY, undefined)).toBe(false);
  });

  it('returns false for a length mismatch (no throw)', () => {
    expect(verifyApiKey(APIKEY + 'x', APIKEY)).toBe(false);
  });
});

describe('POST /webhooks/cloudsignal', () => {
  it('returns 401 when the apikey is missing from the body', async () => {
    const { apikey, ...noKey } = signal();
    const res = await POST(makeRequest(noKey));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the apikey is wrong', async () => {
    const res = await POST(makeRequest(signal({ apikey: 'wrong_key' })));
    expect(res.status).toBe(401);
  });

  it('returns 200 for a valid signal', async () => {
    const res = await POST(makeRequest(signal()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('dispatches every known signal type with a 200', async () => {
    for (const type of KNOWN_EVENT_TYPES) {
      const res = await POST(makeRequest(signal({ type })));
      expect(res.status).toBe(200);
    }
  });

  it('handles ItemShipped with tracking and shipping_option', async () => {
    const res = await POST(
      makeRequest(
        signal({
          type: 'ItemShipped',
          tracking: '1Z999AA10123456784',
          shipping_option: 'GLS',
        })
      )
    );
    expect(res.status).toBe(200);
  });

  it('acknowledges an unknown type with 200 (no retry storm)', async () => {
    const res = await POST(makeRequest(signal({ type: 'SomeFutureSignal' })));
    expect(res.status).toBe(200);
  });
});
