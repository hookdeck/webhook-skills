const request = require('supertest');
const { app, verifyTrueworkToken, safeEqual } = require('../src/index');

// Truework tokens are opaque strings copied from Developer Settings.
const TOKEN = 'tw_test_token_0123456789abcdef';

const orderCompleted = {
  version: '2023-10-30',
  hook: { id: 1, event: 'order.completed', target: 'https://example.com/webhooks/truework' },
  data: { order_id: 'ord_123' },
};
const stateChange = {
  version: '2023-10-30',
  hook: { id: 2, event: 'verification_request.state.change', target: 'https://example.com/webhooks/truework' },
  data: { order_id: 'ord_123', verification_request_id: 'vr_456', state: 'action-required', metadata: {} },
};

function post(body, headers = {}, contentType = 'application/json') {
  return request(app)
    .post('/webhooks/truework')
    .set('Content-Type', contentType)
    .set(headers)
    .send(typeof body === 'string' ? body : JSON.stringify(body));
}

describe('Truework webhook', () => {
  beforeEach(() => {
    process.env.TRUEWORK_WEBHOOK_TOKEN = TOKEN;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('accepts order.completed with the right token', async () => {
    const res = await post(orderCompleted, { 'X-Truework-Token': TOKEN });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, event: 'order.completed' });
  });

  it('accepts verification_request.state.change with the right token', async () => {
    const res = await post(stateChange, { 'X-Truework-Token': TOKEN });
    expect(res.status).toBe(200);
    expect(res.body.event).toBe('verification_request.state.change');
  });

  it('verifies regardless of content type', async () => {
    const res = await post(orderCompleted, { 'X-Truework-Token': TOKEN }, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('accepts unknown events with a valid token', async () => {
    const res = await post({ hook: { event: 'something.else' }, data: {} }, { 'X-Truework-Token': TOKEN });
    expect(res.status).toBe(200);
  });

  it('rejects a missing token', async () => {
    expect((await post(orderCompleted)).status).toBe(401);
  });

  it('rejects a wrong token', async () => {
    expect((await post(orderCompleted, { 'X-Truework-Token': 'nope' })).status).toBe(401);
  });

  it('rejects a token of a different length without throwing', async () => {
    expect((await post(orderCompleted, { 'X-Truework-Token': TOKEN + 'x' })).status).toBe(401);
  });

  it('returns 400 for invalid JSON with a valid token', async () => {
    const res = await post('{not json', { 'X-Truework-Token': TOKEN });
    expect(res.status).toBe(400);
  });

  it('fails closed with 500 when no token is configured', async () => {
    delete process.env.TRUEWORK_WEBHOOK_TOKEN;
    const res = await post(orderCompleted, { 'X-Truework-Token': '' });
    expect(res.status).toBe(500);
  });

  it('does not let an empty header match an unset token', () => {
    expect(verifyTrueworkToken('', '')).toBeNull();
    expect(verifyTrueworkToken(undefined, TOKEN)).toBe(false);
  });

  it('safeEqual compares strings only', () => {
    expect(safeEqual('a', 'a')).toBe(true);
    expect(safeEqual('a', 'b')).toBe(false);
    expect(safeEqual(undefined, 'a')).toBe(false);
  });
});
