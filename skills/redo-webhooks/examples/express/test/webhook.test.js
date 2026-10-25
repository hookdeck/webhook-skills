const request = require('supertest');

const AUTH = 'Bearer your-subscriber-secret-123';
process.env.REDO_AUTHORIZATION = AUTH;

const app = require('../src/index');
const { verifyRedoRequest, classify } = require('../src/index');

// Shapes taken from Redo's documented sample payload (trimmed)
const created = {
  type: 'created',
  at: '2023-08-18T12:00:00Z',
  merchantName: 'Example Merchant',
  return: { id: '64df65d4c5a4ca3eff4b4e43', status: 'pending' },
  order: { id: 'shopify-order-123' },
};
const updated = { ...created, type: 'updated', return: { ...created.return, status: 'approved' } };
const backfill = { ...created, type: 'backfill' };

function post(body, headers = {}, contentType = 'application/json') {
  return request(app)
    .post('/webhooks/redo')
    .set('Content-Type', contentType)
    .set(headers)
    .send(typeof body === 'string' ? body : JSON.stringify(body));
}

describe('Redo webhook', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('accepts the full Authorization header value', async () => {
    const res = await post(created, { Authorization: AUTH });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('rejects a missing Authorization header', async () => {
    expect((await post(created)).status).toBe(401);
  });

  it('rejects a wrong secret', async () => {
    const res = await post(created, { Authorization: 'Bearer some-other-secret' });
    expect(res.status).toBe(401);
  });

  it('rejects the secret without the "Bearer " prefix', async () => {
    const res = await post(created, { Authorization: AUTH.replace('Bearer ', '') });
    expect(res.status).toBe(401);
  });

  it('rejects a different scheme with the same secret', async () => {
    const res = await post(created, { Authorization: AUTH.replace('Bearer', 'Basic') });
    expect(res.status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await post(JSON.stringify(updated), { Authorization: AUTH }, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await post('not json', { Authorization: AUTH })).status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    expect((await post('[1,2]', { Authorization: AUTH })).status).toBe(400);
  });

  it('does not parse the body before the credential check', async () => {
    expect((await post('not json')).status).toBe(401);
  });

  it('accepts updated, backfill and unknown event types', async () => {
    expect((await post(updated, { Authorization: AUTH })).status).toBe(200);
    expect((await post(backfill, { Authorization: AUTH })).status).toBe(200);
    expect((await post({ type: 'other' }, { Authorization: AUTH })).status).toBe(200);
  });

  it('maps payload types to topics', () => {
    expect(classify(created)).toBe('return.created');
    expect(classify(updated)).toBe('return.updated');
    expect(classify(backfill)).toBe('backfill');
    expect(classify({ type: 'x' })).toBeNull();
  });

  it('never accepts when REDO_AUTHORIZATION is unset', () => {
    expect(verifyRedoRequest({ authorization: 'Bearer x' }, {})).toBe(false);
    expect(verifyRedoRequest({ authorization: '' }, { REDO_AUTHORIZATION: '' })).toBe(false);
  });
});
