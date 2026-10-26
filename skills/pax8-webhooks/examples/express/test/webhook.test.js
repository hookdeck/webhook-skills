const request = require('supertest');

const SECRET = 'Bearer 7d9f3c1e-5b2a-4e8d-9a60-c1d2e3f40516';
process.env.PAX8_AUTHORIZATION = SECRET;

const app = require('../src/index');
const { verifyPax8Request, classify } = require('../src/index');

// Illustrative payloads: Pax8's docs elide samplePayload, so the body shape is assumed.
const subscriptionCreate = {
  topic: 'SUBSCRIPTION',
  action: 'CREATE',
  id: '00000000-0000-0000-0000-000000000001',
};
const invoiceCreate = {
  topic: 'INVOICE',
  action: 'CREATE',
  id: '00000000-0000-0000-0000-000000000002',
};

function post(body, headers = {}, contentType = 'application/json') {
  return request(app)
    .post('/webhooks/pax8')
    .set('Content-Type', contentType)
    .set(headers)
    .send(typeof body === 'string' ? body : JSON.stringify(body));
}

describe('Pax8 webhook', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('accepts the full Authorization header value', async () => {
    const res = await post(subscriptionCreate, { Authorization: SECRET });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('rejects a missing Authorization header', async () => {
    expect((await post(subscriptionCreate)).status).toBe(401);
  });

  it('rejects a wrong value', async () => {
    const res = await post(subscriptionCreate, { Authorization: 'Bearer wrong-value' });
    expect(res.status).toBe(401);
  });

  it('rejects the value without its "Bearer " prefix', async () => {
    const res = await post(subscriptionCreate, { Authorization: SECRET.replace('Bearer ', '') });
    expect(res.status).toBe(401);
  });

  it('compares the whole value for a bare (prefix-less) secret', async () => {
    jest.resetModules();
    process.env.PAX8_AUTHORIZATION = 'my_super_secret';
    const bare = require('../src/index');
    const ok = await request(bare)
      .post('/webhooks/pax8')
      .set('Content-Type', 'application/json')
      .set('Authorization', 'my_super_secret')
      .send(JSON.stringify(subscriptionCreate));
    expect(ok.status).toBe(200);
    process.env.PAX8_AUTHORIZATION = SECRET;
  });

  it('authenticates regardless of content type', async () => {
    const res = await post(JSON.stringify(invoiceCreate), { Authorization: SECRET }, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('does not throw on a non-ASCII header value', () => {
    expect(verifyPax8Request({ authorization: 'Bearer é' })).toBe(false);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await post('not json', { Authorization: SECRET })).status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    expect((await post('[1,2]', { Authorization: SECRET })).status).toBe(400);
  });

  it('accepts a payload without topic or action', async () => {
    expect((await post({ foo: 1 }, { Authorization: SECRET })).status).toBe(200);
  });

  it('reads topic and action defensively', () => {
    expect(classify(subscriptionCreate)).toEqual({ topic: 'SUBSCRIPTION', action: 'CREATE' });
    expect(classify({ topic: 'invoice', action: 'update' })).toEqual({ topic: 'INVOICE', action: 'UPDATE' });
    expect(classify({ topic: 5 })).toEqual({ topic: null, action: null });
  });

  it('never accepts when PAX8_AUTHORIZATION is unset', () => {
    expect(verifyPax8Request({ authorization: 'Bearer x' }, {})).toBe(false);
    expect(verifyPax8Request({ authorization: '' }, { PAX8_AUTHORIZATION: '' })).toBe(false);
  });
});
