// Generated with: worldpay-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

const {
  app,
  parseEventSignature,
  verifyWorldpaySignature,
  processEvent,
  WORLDPAY_EVENTS,
  KNOWN_EVENTS,
  seenEventIds,
  setEnqueue,
} = require('../src/index');

// Synthetic shared secrets. Real ones come from your Worldpay Implementation
// Manager over a secure channel. keyId 1 is the current key; keyId 2 is the
// renewed key Worldpay also signs with during a renewal.
const SECRET_1 = 'test-worldpay-shared-secret-key-1';
const SECRET_2 = 'test-worldpay-shared-secret-key-2';
const CONTENT_TYPE = 'application/vnd.worldpay.events-v1.hal+json';

// Envelope from the Access Worldpay events OpenAPI spec (sentForAuthorization example).
const makeEvent = ({ classification = 'payment', type = 'sentForAuthorization', ...overrides } = {}) => ({
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
  ...overrides,
});
const makeBody = (opts) => JSON.stringify(makeEvent(opts));

const hmacHex = (body, secret = SECRET_1) => crypto.createHmac('sha256', secret).update(body).digest('hex');
const sig = (body, keyId = '1', secret = SECRET_1) => `${keyId}/SHA256/${hmacHex(body, secret)}`;

const post = (body, { signature, contentType = CONTENT_TYPE } = {}) => {
  const req = request(app).post('/webhooks/worldpay').set('Content-Type', contentType);
  if (signature !== null) req.set('Event-Signature', signature === undefined ? sig(body) : signature);
  return req.send(body);
};

let queued;

beforeEach(() => {
  process.env.WORLDPAY_WEBHOOK_SECRET_1 = SECRET_1;
  delete process.env.WORLDPAY_WEBHOOK_SECRET_2;
  seenEventIds.clear();
  queued = [];
  setEnqueue((event) => queued.push(event));
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('parseEventSignature', () => {
  it('parses the documented single-signature form', () => {
    expect(parseEventSignature('1/SHA256/abcdef')).toEqual([
      { keyId: '1', hashFunction: 'SHA256', signature: 'abcdef' },
    ]);
  });

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

  it('accepts the hex HMAC-SHA256 of the raw body', () => {
    expect(verifyWorldpaySignature(body, sig(body), one)).toBe(true);
  });

  it('accepts an upper-case hex signature', () => {
    expect(verifyWorldpaySignature(body, `1/SHA256/${hmacHex(body).toUpperCase()}`, one)).toBe(true);
  });

  it('rejects a base64 signature: Worldpay sends hex', () => {
    const b64 = crypto.createHmac('sha256', SECRET_1).update(body).digest('base64');
    expect(verifyWorldpaySignature(body, `1/SHA256/${b64}`, one)).toBe(false);
  });

  it('rejects a bare digest with no keyId/hashFunction', () => {
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
    // Holding only one of the two keys still verifies.
    expect(verifyWorldpaySignature(body, reversed, one)).toBe(true);
    expect(verifyWorldpaySignature(body, header, new Map([['2', SECRET_2]]))).toBe(true);
  });

  it('selects the secret by keyId', () => {
    // A valid key-1 signature labelled as keyId 2 must not verify against secret 2.
    expect(verifyWorldpaySignature(body, `2/SHA256/${hmacHex(body, SECRET_1)}`, both)).toBe(false);
  });

  it('skips entries whose keyId has no secret', () => {
    expect(verifyWorldpaySignature(body, sig(body, '7'), one)).toBe(false);
  });

  it('skips an unsupported hashFunction instead of guessing', () => {
    const sha512 = crypto.createHmac('sha512', SECRET_1).update(body).digest('hex');
    expect(verifyWorldpaySignature(body, `1/SHA512/${sha512}`, one)).toBe(false);
    expect(verifyWorldpaySignature(body, `1/SHA-256/${hmacHex(body)}`, one)).toBe(false);
  });

  it('rejects a truncated signature without throwing', () => {
    expect(verifyWorldpaySignature(body, `1/SHA256/${hmacHex(body).slice(0, 20)}`, one)).toBe(false);
  });

  it('finds a valid entry after malformed ones', () => {
    expect(verifyWorldpaySignature(body, `junk,1/SHA256/00,${sig(body)}`, one)).toBe(true);
  });

  it('hashes the body once per key, however many entries the header repeats', () => {
    const spy = jest.spyOn(crypto, 'createHmac');
    const header = Array.from({ length: 500 }, () => '1/SHA256/00').join(',');
    expect(verifyWorldpaySignature(body, header, one)).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('returns false for a missing header', () => {
    expect(verifyWorldpaySignature(body, undefined, one)).toBe(false);
  });
});

describe('POST /webhooks/worldpay', () => {
  it('accepts a valid signature sent with the Worldpay vendor Content-Type', async () => {
    const body = makeBody();
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      received: true,
      eventId: JSON.parse(body).eventId,
      classification: 'payment',
      type: 'sentForAuthorization',
    });
    expect(queued).toHaveLength(1);
    expect(queued[0].eventDetails.amount).toEqual({ value: 100, currencyCode: 'EUR' });
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
        expect(res.body).toMatchObject({ classification, type });
      }
    }
    expect(queued).toHaveLength(26);
  });

  it('returns 400 (not 401) when Event-Signature is missing', async () => {
    const res = await post(makeBody(), { signature: null });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing Event-Signature header');
  });

  it('returns 400 (not 401) on a signature mismatch', async () => {
    const body = makeBody();
    const res = await post(body, { signature: sig(body, '1', 'wrong-secret') });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
    expect(queued).toHaveLength(0);
  });

  it('returns 400 for a tampered body', async () => {
    const body = makeBody();
    const tampered = body.replace('"value":100', '"value":1');
    expect((await post(tampered, { signature: sig(body) })).status).toBe(400);
  });

  it('returns 400 for a malformed header, never 500', async () => {
    expect((await post(makeBody(), { signature: 'not-a-signature' })).status).toBe(400);
  });

  it('fails closed with 500 when no secret is configured', async () => {
    delete process.env.WORLDPAY_WEBHOOK_SECRET_1;
    const res = await post(makeBody());
    expect(res.status).toBe(500);
    expect(queued).toHaveLength(0);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    expect((await post('{"truncated": ')).status).toBe(400);
  });

  it('returns 400 for signed JSON that is not an Access event', async () => {
    expect((await post(JSON.stringify({ hello: 'world' }))).status).toBe(400);
  });

  it('dedupes a redelivered event on eventId', async () => {
    const body = makeBody();
    await post(body);
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(true);
    expect(queued).toHaveLength(1);
  });

  it('acknowledges an unknown (classification, type) pair without processing it', async () => {
    const res = await post(makeBody({ classification: 'payout', type: 'sentForAuthorization' }));
    expect(res.status).toBe(200);
    expect(res.body.ignored).toBe('unknown event');
    expect(queued).toHaveLength(0);
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
