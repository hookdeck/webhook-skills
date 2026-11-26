// Generated with: strike-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Synthetic subscription secret (Strike accepts any 10-50 character string you choose)
const SECRET = 'strike_test_subscription_secret_01';
process.env.STRIKE_WEBHOOK_SECRET = SECRET;
process.env.STRIKE_API_KEY = 'test_api_key';

const { app, verifyStrikeSignature, processEvent, EVENT_RESOURCES, seenEventIds, setEnqueue } = require('../src/index');

// Compact JSON, as Strike sends it. Shape from Strike's documented example.
const makeBody = (overrides = {}) =>
  JSON.stringify({
    id: crypto.randomUUID(),
    eventType: 'invoice.updated',
    webhookVersion: 'v1',
    data: { entityId: '602cc206-6b4a-42dd-bc89-9a534bb04034', changes: ['state'] },
    created: '2026-11-20T18:15:00+01:00',
    deliverySuccess: true,
    ...overrides,
  });

const sign = (body, key = SECRET) => crypto.createHmac('sha256', key).update(body).digest('hex');

const post = (body, signature) => {
  const req = request(app).post('/webhooks/strike').set('Content-Type', 'application/json');
  if (signature !== undefined) req.set('X-Webhook-Signature', signature);
  return req.send(body);
};

let queued;

beforeEach(() => {
  process.env.STRIKE_WEBHOOK_SECRET = SECRET;
  delete process.env.STRIKE_WEBHOOK_SECRET_PREVIOUS;
  process.env.STRIKE_API_KEY = 'test_api_key';
  seenEventIds.clear();
  queued = [];
  setEnqueue((event) => queued.push(event));
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  delete global.fetch;
});

describe('verifyStrikeSignature', () => {
  const body = makeBody();

  it('accepts lowercase hex HMAC-SHA256 of the raw body', () => {
    expect(verifyStrikeSignature(body, sign(body), [SECRET])).toBe(true);
  });

  it('rejects a base64 digest: Strike sends hex', () => {
    const b64 = crypto.createHmac('sha256', SECRET).update(body).digest('base64');
    expect(verifyStrikeSignature(body, b64, [SECRET])).toBe(false);
  });

  it('rejects a Stripe-style t=,v1= value', () => {
    expect(verifyStrikeSignature(body, `t=1,v1=${sign(body)}`, [SECRET])).toBe(false);
  });

  it('rejects a truncated signature without throwing', () => {
    expect(verifyStrikeSignature(body, sign(body).slice(0, 40), [SECRET])).toBe(false);
  });

  it('rejects re-serialised (pretty-printed) JSON signed bytes', () => {
    const pretty = JSON.stringify(JSON.parse(body), null, 2);
    expect(verifyStrikeSignature(body, sign(pretty), [SECRET])).toBe(false);
  });
});

describe('POST /webhooks/strike', () => {
  it('accepts a valid signature and queues the event', async () => {
    const body = makeBody();
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true, id: JSON.parse(body).id, eventType: 'invoice.updated' });
    expect(queued).toHaveLength(1);
    expect(queued[0].data.entityId).toBe('602cc206-6b4a-42dd-bc89-9a534bb04034');
  });

  it('accepts every documented event type', async () => {
    for (const eventType of Object.keys(EVENT_RESOURCES)) {
      const body = makeBody({ eventType });
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      expect(res.body.eventType).toBe(eventType);
    }
    expect(queued).toHaveLength(14);
  });

  it('returns 200 and ignores an unknown eventType', async () => {
    const body = makeBody({ eventType: 'lightning-address.created' });
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(res.body.ignored).toBe('unknown eventType');
    expect(queued).toHaveLength(0);
  });

  it('dedupes a redelivered event on id', async () => {
    const body = makeBody();
    await post(body, sign(body));
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(true);
    expect(queued).toHaveLength(1);
  });

  it('acknowledges but does not process a non-v1 payload', async () => {
    const body = makeBody({ webhookVersion: 'v2' });
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(res.body.ignored).toBe('unsupported webhookVersion');
    expect(queued).toHaveLength(0);
  });

  it('handles a *.created event with no data.changes', async () => {
    const body = makeBody({ eventType: 'invoice.created', data: { entityId: 'abc' } });
    expect((await post(body, sign(body))).status).toBe(200);
  });

  it('accepts the previous secret during a rotation', async () => {
    process.env.STRIKE_WEBHOOK_SECRET = 'strike_new_subscription_secret_02';
    process.env.STRIKE_WEBHOOK_SECRET_PREVIOUS = SECRET;
    const body = makeBody();
    expect((await post(body, sign(body))).status).toBe(200);
  });

  it('rejects a signature made with the API key instead of the subscription secret', async () => {
    const body = makeBody();
    expect((await post(body, sign(body, process.env.STRIKE_API_KEY))).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const body = makeBody();
    expect((await post(body.replace('invoice.updated', 'payout.updated'), sign(body))).status).toBe(401);
  });

  it('rejects a missing header with 401', async () => {
    expect((await post(makeBody())).status).toBe(401);
  });

  it('rejects a malformed or wrong-length header with 401, not 500', async () => {
    const body = makeBody();
    expect((await post(body, 'abc')).status).toBe(401);
    expect((await post(body, `${sign(body)}00`)).status).toBe(401);
    expect((await post(body, 'z'.repeat(64))).status).toBe(401);
  });

  it('fails closed with 401 when STRIKE_WEBHOOK_SECRET is not set', async () => {
    delete process.env.STRIKE_WEBHOOK_SECRET;
    const body = makeBody();
    expect((await post(body, sign(body))).status).toBe(401);
    expect(queued).toHaveLength(0);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"truncated": ';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('responds before the fetch-back finishes (5-second timeout)', async () => {
    setEnqueue((event) => {
      processEvent(event).catch(() => {});
    });
    global.fetch = jest.fn(() => new Promise(() => {})); // Strike API never answers
    const body = makeBody();
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('processEvent (fetch-back)', () => {
  const okFetch = () => jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ state: 'PAID' }) }));

  it.each([
    ['invoice.updated', 'https://api.strike.me/v1/invoices/id-1'],
    ['payment-method.bank.created', 'https://api.strike.me/v1/payment-methods/bank/id-1'],
    ['payout-originator.updated', 'https://api.strike.me/v1/payout-originators/id-1'],
    ['currency-exchange-quote.updated', 'https://api.strike.me/v1/currency-exchange-quotes/id-1'],
    ['deposit.updated', 'https://api.strike.me/v1/deposits/id-1'],
    ['receive-request.receive-completed', 'https://api.strike.me/v1/receive-requests/id-1'],
  ])('%s fetches %s with the API key', async (eventType, url) => {
    global.fetch = okFetch();
    await processEvent({ id: 'e1', eventType, webhookVersion: 'v1', data: { entityId: 'id-1' } });
    expect(global.fetch).toHaveBeenCalledWith(url, expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer test_api_key' }),
    }));
  });

  it('skips the call when STRIKE_API_KEY is not set', async () => {
    delete process.env.STRIKE_API_KEY;
    global.fetch = okFetch();
    expect(await processEvent({ id: 'e1', eventType: 'invoice.updated', data: { entityId: 'x' } })).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
