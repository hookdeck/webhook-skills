const request = require('supertest');

const AUTH = 'k7Hq2mZp9XvT4rLb8NwY';
process.env.ZOOP_AUTHORIZATION = AUTH;

const app = require('../src/index');
const { verifyZoopRequest, processEvent, resetSeen } = require('../src/index');

// Shapes follow Zoop's documented event body and ping
const event = (type, id = `evt_${type}`, object = { id: 'obj_1' }) => ({
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

function post(body, headers = {}, contentType = 'application/json') {
  return request(app)
    .post('/webhooks/zoop')
    .set('Content-Type', contentType)
    .set(headers)
    .send(typeof body === 'string' ? body : JSON.stringify(body));
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('Zoop webhook', () => {
  let log;
  beforeEach(() => {
    resetSeen();
    log = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('accepts the Authorization header verbatim', async () => {
    const res = await post(event('transaction.succeeded'), { Authorization: AUTH });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts the ping validation event', async () => {
    const res = await post(ping, { Authorization: AUTH });
    expect(res.status).toBe(200);
    await flush();
    expect(log).toHaveBeenCalledWith('Zoop ping received');
  });

  it('rejects a missing Authorization header', async () => {
    expect((await post(ping)).status).toBe(401);
  });

  it('rejects a wrong value', async () => {
    expect((await post(ping, { Authorization: 'wrong-value' })).status).toBe(401);
  });

  it('compares the whole header: a Bearer prefix is not stripped', async () => {
    expect((await post(ping, { Authorization: `Bearer ${AUTH}` })).status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await post(JSON.stringify(ping), { Authorization: AUTH }, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await post('not json', { Authorization: AUTH })).status).toBe(400);
  });

  it('returns 400 for a JSON array or a body without a type', async () => {
    expect((await post('[1,2]', { Authorization: AUTH })).status).toBe(400);
    expect((await post({ id: 'x' }, { Authorization: AUTH })).status).toBe(400);
  });

  it('only accepts POST', async () => {
    const res = await request(app).get('/webhooks/zoop').set({ Authorization: AUTH });
    expect(res.status).toBe(404);
  });

  it('processes the event after responding', async () => {
    await post(event('transaction.failed', 'evt_f', { id: 'tx_9' }), { Authorization: AUTH });
    await flush();
    expect(log).toHaveBeenCalledWith('Transaction tx_9 failed');
  });

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

  it('never accepts when ZOOP_AUTHORIZATION is unset', () => {
    expect(verifyZoopRequest({ authorization: 'x' }, {})).toBe(false);
    expect(verifyZoopRequest({ authorization: '' }, { ZOOP_AUTHORIZATION: '' })).toBe(false);
  });
});
