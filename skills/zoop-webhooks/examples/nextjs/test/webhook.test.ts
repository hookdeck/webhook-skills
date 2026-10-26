import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/zoop/route';
import { processEvent, resetSeen, verifyZoopRequest } from '../lib/zoop';

const AUTH = 'k7Hq2mZp9XvT4rLb8NwY';
process.env.ZOOP_AUTHORIZATION = AUTH;

// Shapes follow Zoop's documented event body and ping
const event = (type: string, id = `evt_${type}`, object: Record<string, unknown> = { id: 'obj_1' }) => ({
  id,
  resource: 'event',
  type,
  source: 'API',
  payload: { object },
  uri: `/v1/marketplaces/mkt_1/events/${id}`,
  created_at: '2015-06-17T20:12:25',
  updated_at: '2015-06-18T07:45:02',
});
const ping = {
  id: 'ping_1',
  type: 'ping',
  resource: 'event',
  payload: { object: { ping: 'true' } },
  source: null,
  name: null,
  uri: '/v1/marketplaces/mkt_1/events/evt_1',
  created_at: '2020-04-01T18:21:33+0000',
  updated_at: '2020-04-01T18:21:33+0000',
};

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(ping),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/zoop', {
    method: 'POST',
    headers: { 'Content-Type': contentType, ...headers },
    body,
  });
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('Zoop webhook route', () => {
  let log: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    resetSeen();
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('accepts the Authorization header verbatim', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH }, JSON.stringify(event('transaction.succeeded'))));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts the ping validation event', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH }));
    expect(res.status).toBe(200);
    await flush();
    expect(log).toHaveBeenCalledWith('Zoop ping received');
  });

  it('rejects a missing Authorization header', async () => {
    expect((await POST(makeRequest())).status).toBe(401);
  });

  it('rejects a wrong value', async () => {
    expect((await POST(makeRequest({ Authorization: 'wrong-value' }))).status).toBe(401);
  });

  it('compares the whole header: a Bearer prefix is not stripped', async () => {
    expect((await POST(makeRequest({ Authorization: `Bearer ${AUTH}` }))).status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH }, JSON.stringify(ping), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await POST(makeRequest({ Authorization: AUTH }, 'not json'))).status).toBe(400);
  });

  it('returns 400 for a JSON array or a body without a type', async () => {
    expect((await POST(makeRequest({ Authorization: AUTH }, '[1,2]'))).status).toBe(400);
    expect((await POST(makeRequest({ Authorization: AUTH }, '{"id":"x"}'))).status).toBe(400);
  });

  it('processes the event after responding', async () => {
    await POST(makeRequest({ Authorization: AUTH }, JSON.stringify(event('transaction.failed', 'evt_f', { id: 'tx_9' }))));
    await flush();
    expect(log).toHaveBeenCalledWith('Transaction tx_9 failed');
  });
});

describe('processEvent', () => {
  let log: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    resetSeen();
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['transaction.succeeded', 'Transaction obj_1 succeeded'],
    ['transaction.failed', 'Transaction obj_1 failed'],
    ['transaction.canceled', 'Transaction obj_1 canceled'],
    ['seller.activated', 'Seller obj_1 activated'],
    ['bank_account.associated', 'Bank account obj_1 associated'],
  ])('dispatches %s', (type, message) => {
    expect(processEvent(event(type))).toBe(type);
    expect(log).toHaveBeenCalledWith(message);
  });

  it('logs unknown event types without failing', () => {
    expect(processEvent(event('invoice.paid'))).toBe('invoice.paid');
    expect(log).toHaveBeenCalledWith('Unhandled Zoop event type: invoice.paid');
  });

  it('dedupes on the event id', () => {
    expect(processEvent(event('transaction.succeeded', 'evt_dup'))).toBe('transaction.succeeded');
    expect(processEvent(event('transaction.succeeded', 'evt_dup'))).toBe('duplicate');
    expect(log).toHaveBeenCalledTimes(1);
  });
});

describe('verifyZoopRequest', () => {
  it('never accepts when ZOOP_AUTHORIZATION is unset', () => {
    expect(verifyZoopRequest(new Headers({ authorization: 'x' }), {})).toBe(false);
    expect(verifyZoopRequest(new Headers({ authorization: '' }), { ZOOP_AUTHORIZATION: '' })).toBe(false);
  });
});
