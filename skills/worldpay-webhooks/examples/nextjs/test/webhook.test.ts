// Generated with: worldpay-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';

// after() needs a Next.js request scope. Capture the callbacks instead so the
// tests can check that processing is deferred until after the response.
const deferred: Array<() => unknown> = [];
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: (fn: () => unknown) => deferred.push(fn) };
});

import { POST } from '../app/webhooks/worldpay/route';
import {
  KNOWN_EVENTS,
  WORLDPAY_EVENTS,
  parseEventSignature,
  processEvent,
  seenEventIds,
  verifyWorldpaySignature,
} from '../lib/worldpay';

// Synthetic shared secrets. Real ones come from your Worldpay Implementation
// Manager over a secure channel. keyId 1 is the current key; keyId 2 is the
// renewed key Worldpay also signs with during a renewal.
const SECRET_1 = 'test-worldpay-shared-secret-key-1';
const SECRET_2 = 'test-worldpay-shared-secret-key-2';
const CONTENT_TYPE = 'application/vnd.worldpay.events-v1.hal+json';

// Envelope from the Access Worldpay events OpenAPI spec (sentForAuthorization example).
const makeEvent = ({ classification = 'payment', type = 'sentForAuthorization' } = {}) => ({
  eventId: crypto.randomUUID(),
  eventTimestamp: '2018-06-13T14:18:13.407',
  eventDetails: {
    classification,
    downstreamReference: '3378792436',
    transactionReference: 'Memory265-13/08/1876',
    type,
    date: '2018-06-13',
    amount: { value: 100, currencyCode: 'EUR' },
    _links: { 'payments:events': { href: 'https://try.access.worldpay.com/payments/events/eyJrIjoiazNhYjYzMiJ9' } },
  },
});
const makeBody = (opts?: { classification?: string; type?: string }) => JSON.stringify(makeEvent(opts));

const hmacHex = (body: string, secret = SECRET_1) => crypto.createHmac('sha256', secret).update(body).digest('hex');
const sig = (body: string, keyId = '1', secret = SECRET_1) => `${keyId}/SHA256/${hmacHex(body, secret)}`;

const post = (body: string, opts: { signature?: string | null } = {}) => {
  const headers: Record<string, string> = { 'content-type': CONTENT_TYPE };
  if (opts.signature !== null) headers['Event-Signature'] = opts.signature ?? sig(body);
  return POST(new Request('http://localhost/webhooks/worldpay', { method: 'POST', headers, body }));
};

beforeEach(() => {
  process.env.WORLDPAY_WEBHOOK_SECRET_1 = SECRET_1;
  delete process.env.WORLDPAY_WEBHOOK_SECRET_2;
  seenEventIds.clear();
  deferred.length = 0;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseEventSignature', () => {
  it('parses comma-separated signatures and trims whitespace', () => {
    expect(parseEventSignature('1/SHA256/aaa, 2/SHA256/bbb')).toEqual([
      { keyId: '1', hashFunction: 'SHA256', signature: 'aaa' },
      { keyId: '2', hashFunction: 'SHA256', signature: 'bbb' },
    ]);
  });

  it('skips malformed entries without throwing', () => {
    expect(parseEventSignature('garbage,1/SHA256,1/SHA256/a/b,//,,3/SHA256/ccc')).toEqual([
      { keyId: '3', hashFunction: 'SHA256', signature: 'ccc' },
    ]);
  });
});

describe('verifyWorldpaySignature', () => {
  const body = makeBody();
  const one = new Map([['1', SECRET_1]]);
  const both = new Map([['1', SECRET_1], ['2', SECRET_2]]);

  it('accepts the hex HMAC-SHA256 of the raw body, in either case', () => {
    expect(verifyWorldpaySignature(body, sig(body), one)).toBe(true);
    expect(verifyWorldpaySignature(body, `1/SHA256/${hmacHex(body).toUpperCase()}`, one)).toBe(true);
  });

  it('rejects base64 and bare digests', () => {
    const b64 = crypto.createHmac('sha256', SECRET_1).update(body).digest('base64');
    expect(verifyWorldpaySignature(body, `1/SHA256/${b64}`, one)).toBe(false);
    expect(verifyWorldpaySignature(body, hmacHex(body), one)).toBe(false);
  });

  it('rejects a signature over re-serialised JSON', () => {
    const pretty = JSON.stringify(JSON.parse(body), null, 2);
    expect(verifyWorldpaySignature(body, sig(pretty), one)).toBe(false);
  });

  it('accepts either order of two signatures during key renewal', () => {
    const header = `${sig(body, '1', SECRET_1)},${sig(body, '2', SECRET_2)}`;
    const reversed = `${sig(body, '2', SECRET_2)},${sig(body, '1', SECRET_1)}`;
    expect(verifyWorldpaySignature(body, header, both)).toBe(true);
    expect(verifyWorldpaySignature(body, reversed, both)).toBe(true);
    expect(verifyWorldpaySignature(body, reversed, one)).toBe(true);
  });

  it('selects the secret by keyId', () => {
    expect(verifyWorldpaySignature(body, `2/SHA256/${hmacHex(body, SECRET_1)}`, both)).toBe(false);
    expect(verifyWorldpaySignature(body, sig(body, '7'), one)).toBe(false);
  });

  it('skips an unsupported hashFunction instead of guessing', () => {
    const sha512 = crypto.createHmac('sha512', SECRET_1).update(body).digest('hex');
    expect(verifyWorldpaySignature(body, `1/SHA512/${sha512}`, one)).toBe(false);
  });

  it('rejects a truncated signature without throwing', () => {
    expect(verifyWorldpaySignature(body, `1/SHA256/${hmacHex(body).slice(0, 20)}`, one)).toBe(false);
  });

  it('hashes the body once per key, however many entries the header repeats', () => {
    const spy = vi.spyOn(crypto, 'createHmac');
    const header = Array.from({ length: 500 }, () => '1/SHA256/00').join(',');
    expect(verifyWorldpaySignature(body, header, one)).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('POST /webhooks/worldpay', () => {
  it('accepts a valid signature and defers processing until after the response', async () => {
    const body = makeBody();
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      received: true,
      eventId: JSON.parse(body).eventId,
      classification: 'payment',
      type: 'sentForAuthorization',
    });
    expect(deferred).toHaveLength(1);
  });

  it('verifies the raw bytes of a pretty-printed body', async () => {
    const body = JSON.stringify(makeEvent(), null, 2);
    expect((await post(body)).status).toBe(200);
  });

  it('accepts a renewal delivery carrying two signatures', async () => {
    process.env.WORLDPAY_WEBHOOK_SECRET_2 = SECRET_2;
    const body = makeBody();
    const res = await post(body, { signature: `${sig(body, '2', SECRET_2)},${sig(body, '1', SECRET_1)}` });
    expect(res.status).toBe(200);
  });

  it('accepts every documented (classification, type) pair', async () => {
    expect(KNOWN_EVENTS.size).toBe(26);
    for (const [classification, types] of Object.entries(WORLDPAY_EVENTS)) {
      for (const type of types) {
        const res = await post(makeBody({ classification, type }));
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ classification, type });
      }
    }
    expect(deferred).toHaveLength(26);
  });

  it('returns 400 (not 401) when Event-Signature is missing', async () => {
    const res = await post(makeBody(), { signature: null });
    expect(res.status).toBe(400);
  });

  it('returns 400 (not 401) on a signature mismatch', async () => {
    const body = makeBody();
    const res = await post(body, { signature: sig(body, '1', 'wrong-secret') });
    expect(res.status).toBe(400);
    expect(deferred).toHaveLength(0);
  });

  it('returns 400 for a tampered body or a malformed header', async () => {
    const body = makeBody();
    expect((await post(body.replace('"value":100', '"value":1'), { signature: sig(body) })).status).toBe(400);
    expect((await post(body, { signature: 'not-a-signature' })).status).toBe(400);
  });

  it('fails closed with 500 when no secret is configured', async () => {
    delete process.env.WORLDPAY_WEBHOOK_SECRET_1;
    expect((await post(makeBody())).status).toBe(500);
    expect(deferred).toHaveLength(0);
  });

  it('returns 400 for invalid JSON or a non-event body after a valid signature', async () => {
    expect((await post('{"truncated": ')).status).toBe(400);
    expect((await post(JSON.stringify({ hello: 'world' }))).status).toBe(400);
  });

  it('dedupes a redelivered event on eventId', async () => {
    const body = makeBody();
    await post(body);
    const res = await post(body);
    expect(res.status).toBe(200);
    expect((await res.json()).duplicate).toBe(true);
    expect(deferred).toHaveLength(1);
  });

  it('acknowledges an unknown (classification, type) pair without processing it', async () => {
    const res = await post(makeBody({ classification: 'payout', type: 'sentForAuthorization' }));
    expect(res.status).toBe(200);
    expect((await res.json()).ignored).toBe('unknown event');
    expect(deferred).toHaveLength(0);
  });
});

describe('processEvent', () => {
  it('routes payment:refused and payout:refused differently', async () => {
    const payment = await processEvent(makeEvent({ classification: 'payment', type: 'refused' }));
    const payout = await processEvent(makeEvent({ classification: 'payout', type: 'refused' }));
    expect(payment.action).toBe('payment did not complete');
    expect(payout.action).toBe('payout refused');
  });

  it('handles a payout event with no downstreamReference or _links', async () => {
    const summary = await processEvent({
      eventId: 'e1',
      eventTimestamp: '2018-06-13T14:18:13.407',
      eventDetails: {
        classification: 'payout',
        transactionReference: 'payout-ref-1',
        type: 'disbursed',
        date: '2018-06-13',
        amount: { value: 250, currencyCode: 'GBP' },
      },
    });
    expect(summary).toMatchObject({ action: 'payout progressing', amount: 250, currency: 'GBP' });
    expect(summary.downstreamReference).toBeUndefined();
  });
});
