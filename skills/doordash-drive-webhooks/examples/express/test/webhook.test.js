const request = require('supertest');

// Whatever text is entered in the Developer Portal is sent verbatim; here a "Bearer"-style value
const CRED = 'Bearer ddk_9f2c1a7e4b6d4e0c8a31';
process.env.DOORDASH_DRIVE_AUTHORIZATION = CRED;

const app = require('../src/index');
const { verifyDoorDashDriveRequest, classify } = require('../src/index');

// Shape from DoorDash's documented example payload (trimmed)
const delivery = (event_name, extra = {}) => ({
  created_at: '2022-02-01T23:18:22.791883Z',
  event_name,
  external_delivery_id: 'c19a5d37-e457-4247-9a67-921ec0134125',
  dasher_id: 123212,
  dasher_name: 'John D.',
  dasher_location: { lat: 43.333333333, lng: -79.333333333 },
  ...extra,
});
// Refund webhooks have no event_name
const refund = {
  event_data: {
    reason: 'delivered_late',
    reason_comments: 'order_ready_dasher_late_time_period_1',
    amount: '750',
    currency_code: 'USD',
    order_details: { order_value: 5000, tip: 200, delivery_charge: 599 },
  },
};

function post(body, headers = {}, contentType = 'application/json') {
  return request(app)
    .post('/webhooks/doordash-drive')
    .set('Content-Type', contentType)
    .set(headers)
    .send(typeof body === 'string' ? body : JSON.stringify(body));
}

describe('DoorDash Drive webhook', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('accepts the full Authorization header value', async () => {
    const res = await post(delivery('DASHER_CONFIRMED'), { Authorization: CRED });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('rejects a missing Authorization header', async () => {
    expect((await post(delivery('DASHER_CONFIRMED'))).status).toBe(401);
  });

  it('rejects a wrong credential', async () => {
    const res = await post(delivery('DASHER_CONFIRMED'), { Authorization: 'Bearer nope' });
    expect(res.status).toBe(401);
  });

  it('does not strip the scheme prefix', async () => {
    const res = await post(delivery('DASHER_CONFIRMED'), { Authorization: CRED.replace('Bearer ', '') });
    expect(res.status).toBe(401);
  });

  it('accepts a bare token credential without decoding it as Basic', async () => {
    jest.resetModules();
    process.env.DOORDASH_DRIVE_AUTHORIZATION = 'my-bare-token';
    const bare = require('../src/index');
    const res = await request(bare)
      .post('/webhooks/doordash-drive')
      .set('Content-Type', 'application/json')
      .set('Authorization', 'my-bare-token')
      .send(JSON.stringify(delivery('DASHER_PICKED_UP')));
    expect(res.status).toBe(200);
    process.env.DOORDASH_DRIVE_AUTHORIZATION = CRED;
  });

  it('rejects a credential that differs only in length', async () => {
    expect((await post(delivery('DASHER_CONFIRMED'), { Authorization: CRED + 'x' })).status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await post(JSON.stringify(delivery('DASHER_DROPPED_OFF')), { Authorization: CRED }, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await post('not json', { Authorization: CRED })).status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    expect((await post('[1,2]', { Authorization: CRED })).status).toBe(400);
  });

  it('accepts every documented delivery event, refunds and enroute events', async () => {
    const names = [
      'DASHER_CONFIRMED', 'DASHER_CONFIRMED_PICKUP_ARRIVAL', 'DASHER_PICKED_UP',
      'DASHER_CONFIRMED_DROPOFF_ARRIVAL', 'DASHER_DROPPED_OFF', 'DELIVERY_CANCELLED',
      'DELIVERY_RETURN_INITIALIZED', 'DASHER_CONFIRMED_RETURN_ARRIVAL', 'DELIVERY_RETURNED',
      'DELIVERY_BATCHED', 'dasher_enroute_to_pickup', 'dasher_enroute_to_dropoff',
      'dasher_enroute_to_return',
    ];
    for (const n of names) {
      expect((await post(delivery(n), { Authorization: CRED })).status).toBe(200);
    }
    expect((await post(refund, { Authorization: CRED })).status).toBe(200);
  });

  it('classifies delivery, refund and unknown payloads', () => {
    expect(classify(delivery('DASHER_PICKED_UP'))).toBe('DASHER_PICKED_UP');
    expect(classify(refund)).toBe('refund');
    expect(classify({ foo: 1 })).toBeNull();
  });

  it('never accepts when DOORDASH_DRIVE_AUTHORIZATION is unset', () => {
    expect(verifyDoorDashDriveRequest({ authorization: 'x' }, {})).toBe(false);
    expect(verifyDoorDashDriveRequest({ authorization: '' }, { DOORDASH_DRIVE_AUTHORIZATION: '' })).toBe(false);
  });
});
