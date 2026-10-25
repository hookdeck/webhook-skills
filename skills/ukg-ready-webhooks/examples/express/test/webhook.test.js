const request = require('supertest');

const AUTH = 'Bearer 7f3c9a1e5b2d4c68a0e1f2d3c4b5a697';
process.env.UKG_READY_AUTHORIZATION = AUTH;

const app = require('../src/index');
const { verifyUkgReadyRequest } = require('../src/index');

// ILLUSTRATIVE payload: UKG Ready shows the real shape only in the app, per subscription
// (the fields you tick). These field names are made up for the test.
const accountCreated = { accountId: 1001, firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' };
const accountUpdated = { accountId: 1001, email: 'ada.lovelace@example.com', phone: '555-0100' };

function post(body, headers = {}, contentType = 'application/json') {
  return request(app)
    .post('/webhooks/ukg-ready')
    .set('Content-Type', contentType)
    .set(headers)
    .send(typeof body === 'string' ? body : JSON.stringify(body));
}

describe('UKG Ready webhook', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('accepts the full Authorization header value (ACCOUNT_CREATED)', async () => {
    const res = await post(accountCreated, { Authorization: AUTH });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts an ACCOUNT_UPDATED style payload', async () => {
    expect((await post(accountUpdated, { Authorization: AUTH })).status).toBe(200);
  });

  it('rejects a missing Authorization header', async () => {
    expect((await post(accountCreated)).status).toBe(401);
  });

  it('rejects a wrong token', async () => {
    const res = await post(accountCreated, { Authorization: 'Bearer wrong-token' });
    expect(res.status).toBe(401);
  });

  it('rejects the token without the "Bearer " prefix', async () => {
    const res = await post(accountCreated, { Authorization: AUTH.replace('Bearer ', '') });
    expect(res.status).toBe(401);
  });

  it('rejects Basic credentials', async () => {
    const basic = 'Basic ' + Buffer.from('user:pass').toString('base64');
    expect((await post(accountCreated, { Authorization: basic })).status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await post(JSON.stringify(accountCreated), { Authorization: AUTH }, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await post('not json', { Authorization: AUTH })).status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    expect((await post('[1,2]', { Authorization: AUTH })).status).toBe(400);
  });

  it('never accepts when UKG_READY_AUTHORIZATION is unset', () => {
    expect(verifyUkgReadyRequest({ authorization: 'Bearer x' }, {})).toBe(false);
    expect(verifyUkgReadyRequest({ authorization: '' }, { UKG_READY_AUTHORIZATION: '' })).toBe(false);
  });
});
