const request = require('supertest');

// NinjaOne issues no signing secret and signs nothing. The secret is a random value you
// generate (openssl rand -hex 32) and register as the X-Webhook-Secret header value.
const SECRET = 'a7c3e9015b2d48f6aa11bb22cc33dd44ee55ff66778899aabbccddeeff001122';
process.env.NINJAONE_WEBHOOK_SECRET = SECRET;

const { app, verifyNinjaOneSecret, processed } = require('../src/index');

let counter = 0;
// Activity object with the field names from the NinjaOne API v2 Activity schema
function makeActivity(overrides = {}) {
  counter += 1;
  return {
    id: 1000 + counter,
    activityTime: 1792577730.5,
    deviceId: 42,
    severity: 'MAJOR',
    priority: 'HIGH',
    seriesUid: '6bcedd3a-fe26-4bcb-9ce9-d3850e38d42c',
    activityType: 'CONDITION',
    statusCode: 'TRIGGERED',
    status: 'Triggered',
    subject: 'Disk free space low',
    message: 'C: has less than 10% free space',
    data: {},
    ...overrides,
  };
}

function post(body, headers = { 'X-Webhook-Secret': SECRET }) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  return request(app)
    .post('/webhooks/ninjaone')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(raw);
}

describe('verifyNinjaOneSecret', () => {
  it('accepts the exact secret', () => {
    expect(verifyNinjaOneSecret(SECRET, SECRET)).toBe(true);
  });
  it('rejects a wrong secret', () => {
    expect(verifyNinjaOneSecret('nope', SECRET)).toBe(false);
  });
  it('rejects a secret of a different length without throwing', () => {
    expect(verifyNinjaOneSecret(SECRET + 'x', SECRET)).toBe(false);
  });
  it('rejects a missing header', () => {
    expect(verifyNinjaOneSecret(undefined, SECRET)).toBe(false);
  });
  it('fails closed when no secret is configured', () => {
    expect(verifyNinjaOneSecret('', '')).toBe(false);
    expect(verifyNinjaOneSecret('anything', undefined)).toBe(false);
  });
});

describe('POST /webhooks/ninjaone', () => {
  beforeEach(() => {
    processed.clear();
    process.env.NINJAONE_WEBHOOK_SECRET = SECRET;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('accepts a CONDITION / TRIGGERED activity', async () => {
    const res = await post(makeActivity());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts a CONDITION / RESET activity', async () => {
    const res = await post(makeActivity({ statusCode: 'RESET' }));
    expect(res.status).toBe(200);
  });

  it('accepts ACTION / COMPLETED and ACTIONSET / STARTED activities', async () => {
    expect((await post(makeActivity({ activityType: 'ACTION', statusCode: 'COMPLETED' }))).status).toBe(200);
    expect((await post(makeActivity({ activityType: 'ACTIONSET', statusCode: 'STARTED' }))).status).toBe(200);
  });

  it('accepts an activity type it does not handle', async () => {
    const res = await post(makeActivity({ activityType: 'SYSTEM', statusCode: 'NODE_CREATED' }));
    expect(res.status).toBe(200);
  });

  it('rejects a missing secret header with 401', async () => {
    const res = await post(makeActivity(), {});
    expect(res.status).toBe(401);
  });

  it('rejects a wrong secret with 401', async () => {
    const res = await post(makeActivity(), { 'X-Webhook-Secret': 'wrong' });
    expect(res.status).toBe(401);
  });

  it('does not accept the secret in a different header', async () => {
    const res = await post(makeActivity(), { Authorization: SECRET });
    expect(res.status).toBe(401);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.NINJAONE_WEBHOOK_SECRET;
    const res = await post(makeActivity());
    expect(res.status).toBe(500);
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await post('{not json');
    expect(res.status).toBe(400);
  });

  it('returns 400 when activityType is missing', async () => {
    const res = await post({ id: 1, statusCode: 'TRIGGERED' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    const res = await post([makeActivity()]);
    expect(res.status).toBe(400);
  });

  it('acknowledges a redelivery without processing it twice', async () => {
    const activity = makeActivity();
    expect((await post(activity)).body).toEqual({ received: true });
    expect((await post(activity)).body).toEqual({ received: true, duplicate: true });
  });

  it('treats a new statusCode on the same activity id as a new event', async () => {
    const activity = makeActivity();
    await post(activity);
    const res = await post({ ...activity, statusCode: 'RESET' });
    expect(res.body).toEqual({ received: true });
  });
});
