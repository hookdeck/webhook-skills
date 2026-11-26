// Generated with: strike-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';

// after() needs a Next.js request scope. Capture the callbacks instead so the
// tests can check that the fetch-back is deferred until after the response.
const deferred: Array<() => unknown> = [];
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: (fn: () => unknown) => deferred.push(fn) };
});

import { POST } from '../app/webhooks/strike/route';
import { EVENT_RESOURCES, processEvent, seenEventIds, verifyStrikeSignature } from '../lib/strike';

// Synthetic subscription secret (Strike accepts any 10-50 character string you choose)
const SECRET = 'strike_test_subscription_secret_01';

const makeBody = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: crypto.randomUUID(),
    eventType: 'invoice.updated',
    webhookVersion: 'v1',
    data: { entityId: '602cc206-6b4a-42dd-bc89-9a534bb04034', changes: ['state'] },
    created: '2026-11-20T18:15:00+01:00',
    deliverySuccess: true,
    ...overrides,
  });

const sign = (body: string, key = SECRET) => crypto.createHmac('sha256', key).update(body).digest('hex');

const post = (body: string, signature?: string) =>
  POST(
    new Request('http://localhost/webhooks/strike', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(signature === undefined ? {} : { 'X-Webhook-Signature': signature }),
      },
      body,
    })
  );

const okFetch = () =>
  vi.fn(async () => new Response(JSON.stringify({ state: 'PAID' }), { status: 200 }));

beforeEach(() => {
  process.env.STRIKE_WEBHOOK_SECRET = SECRET;
  delete process.env.STRIKE_WEBHOOK_SECRET_PREVIOUS;
  process.env.STRIKE_API_KEY = 'test_api_key';
  seenEventIds.clear();
  deferred.length = 0;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('verifyStrikeSignature', () => {
  const body = makeBody();

  it('accepts lowercase hex HMAC-SHA256 of the raw body', () => {
    expect(verifyStrikeSignature(body, sign(body), [SECRET])).toBe(true);
  });

  it('rejects base64, truncated and Stripe-style values', () => {
    const b64 = crypto.createHmac('sha256', SECRET).update(body).digest('base64');
    expect(verifyStrikeSignature(body, b64, [SECRET])).toBe(false);
    expect(verifyStrikeSignature(body, sign(body).slice(0, 40), [SECRET])).toBe(false);
    expect(verifyStrikeSignature(body, `t=1,v1=${sign(body)}`, [SECRET])).toBe(false);
  });

  it('rejects a signature over re-serialised (pretty-printed) JSON', () => {
    const pretty = JSON.stringify(JSON.parse(body), null, 2);
    expect(verifyStrikeSignature(body, sign(pretty), [SECRET])).toBe(false);
  });
});

describe('POST /webhooks/strike', () => {
  it('accepts a valid signature and defers the fetch-back', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);
    const body = makeBody();
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, id: JSON.parse(body).id, eventType: 'invoice.updated' });

    // Nothing fetched before responding...
    expect(fetchMock).not.toHaveBeenCalled();
    expect(deferred).toHaveLength(1);
    // ...the deferred task fetches the invoice by entityId.
    await deferred[0]();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.strike.me/v1/invoices/602cc206-6b4a-42dd-bc89-9a534bb04034',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test_api_key' }) })
    );
  });

  it('accepts every documented event type', async () => {
    for (const eventType of Object.keys(EVENT_RESOURCES)) {
      const body = makeBody({ eventType });
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
    }
    expect(deferred).toHaveLength(14);
  });

  it('returns 200 and ignores an unknown eventType', async () => {
    const body = makeBody({ eventType: 'lightning-address.created' });
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect((await res.json()).ignored).toBe('unknown eventType');
    expect(deferred).toHaveLength(0);
  });

  it('dedupes a redelivered event on id', async () => {
    const body = makeBody();
    await post(body, sign(body));
    const res = await post(body, sign(body));
    expect((await res.json()).duplicate).toBe(true);
    expect(deferred).toHaveLength(1);
  });

  it('acknowledges but does not process a non-v1 payload', async () => {
    const body = makeBody({ webhookVersion: 'v2' });
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(deferred).toHaveLength(0);
  });

  it('accepts the previous secret during a rotation', async () => {
    process.env.STRIKE_WEBHOOK_SECRET = 'strike_new_subscription_secret_02';
    process.env.STRIKE_WEBHOOK_SECRET_PREVIOUS = SECRET;
    const body = makeBody();
    expect((await post(body, sign(body))).status).toBe(200);
  });

  it('rejects the API key as signing key, a tampered body and a missing header', async () => {
    const body = makeBody();
    expect((await post(body, sign(body, 'test_api_key'))).status).toBe(401);
    expect((await post(body.replace('invoice.updated', 'payout.updated'), sign(body))).status).toBe(401);
    expect((await post(body)).status).toBe(401);
  });

  it('rejects a wrong-length header with 401, not 500', async () => {
    const body = makeBody();
    expect((await post(body, 'abc')).status).toBe(401);
    expect((await post(body, `${sign(body)}00`)).status).toBe(401);
  });

  it('fails closed with 401 when STRIKE_WEBHOOK_SECRET is not set', async () => {
    delete process.env.STRIKE_WEBHOOK_SECRET;
    const body = makeBody();
    expect((await post(body, sign(body))).status).toBe(401);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"truncated": ';
    expect((await post(body, sign(body))).status).toBe(400);
  });
});

describe('processEvent (fetch-back)', () => {
  it.each([
    ['payment-method.bank.updated', 'https://api.strike.me/v1/payment-methods/bank/id-1'],
    ['payout.created', 'https://api.strike.me/v1/payouts/id-1'],
    ['payment.updated', 'https://api.strike.me/v1/payments/id-1'],
    ['receive-request.receive-pending', 'https://api.strike.me/v1/receive-requests/id-1'],
  ])('%s fetches %s', async (eventType, url) => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);
    await processEvent({ id: 'e1', eventType, webhookVersion: 'v1', data: { entityId: 'id-1' }, created: '' });
    expect(fetchMock).toHaveBeenCalledWith(url, expect.anything());
  });

  it('skips the call when STRIKE_API_KEY is not set', async () => {
    delete process.env.STRIKE_API_KEY;
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);
    const event = { id: 'e1', eventType: 'invoice.updated', webhookVersion: 'v1', data: { entityId: 'x' }, created: '' };
    expect(await processEvent(event)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
