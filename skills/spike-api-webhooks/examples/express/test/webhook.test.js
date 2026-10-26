const crypto = require('crypto');
const request = require('supertest');

const SECRET = 'test_spike_api_secret';
process.env.SPIKE_API_WEBHOOK_SECRET = SECRET;
process.env.NODE_ENV = 'test';

const app = require('../src/index');

// Bare lowercase hex HMAC-SHA256 of the raw body, keyed with the secret
const sign = (body, secret = SECRET) => crypto.createHmac('sha256', secret).update(body).digest('hex');

// Payloads as shown in the Spike API docs
const RECORD_CHANGE = JSON.stringify([
  {
    application_user_id: 'User1',
    timestamp: '2025-04-15T13:33:55.271331177Z',
    event_type: 'record_change',
    metrics: ['calories_burned_active', 'distance', 'steps'],
    activity_types: ['sedentary', 'walking'],
    provider_slug: 'garmin',
    earliest_record_start_at: '2025-04-15T09:30:00Z',
    latest_record_end_at: '2025-04-15T13:33:00Z',
  },
  {
    application_user_id: 'User2',
    timestamp: '2025-04-15T13:33:55.271331177Z',
    event_type: 'record_change',
    metrics: ['calories_burned_active'],
    activity_types: ['walking'],
    provider_slug: 'garmin',
    earliest_record_start_at: '2025-04-15T09:30:00Z',
    latest_record_end_at: '2025-04-15T13:33:00Z',
  },
]);
const INTEGRATION_CREATED = JSON.stringify([
  {
    application_user_id: 'test',
    timestamp: '2025-08-29T13:21:10.703300387Z',
    event_type: 'provider_integration_created',
    provider_slug: 'oura',
  },
]);
const INTEGRATION_DELETED = JSON.stringify([
  {
    application_user_id: 'test',
    timestamp: '2025-08-29T13:21:10.703300387Z',
    event_type: 'provider_integration_deleted',
    provider_slug: 'oura',
  },
]);

const post = (body, headers = {}) =>
  request(app)
    .post('/webhooks/spike-api')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(body);

describe('Spike API webhook', () => {
  let logSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => logSpy.mockRestore());

  it.each([
    ['record_change', RECORD_CHANGE],
    ['provider_integration_created', INTEGRATION_CREATED],
    ['provider_integration_deleted', INTEGRATION_DELETED],
  ])('accepts a validly signed %s delivery', async (_name, body) => {
    const res = await post(body, { 'X-Body-Signature': sign(body) });
    expect(res.status).toBe(200);
  });

  it('handles every event in a batched delivery', async () => {
    await post(RECORD_CHANGE, { 'X-Body-Signature': sign(RECORD_CHANGE) });
    const lines = logSpy.mock.calls.map((c) => c.join(' '));
    expect(lines.some((l) => l.includes('User1'))).toBe(true);
    expect(lines.some((l) => l.includes('User2'))).toBe(true);
  });

  it('accepts uppercase hex', async () => {
    const res = await post(RECORD_CHANGE, { 'X-Body-Signature': sign(RECORD_CHANGE).toUpperCase() });
    expect(res.status).toBe(200);
  });

  it('verifies the exact bytes, whatever the content type', async () => {
    const body = '[ {"event_type":"provider_integration_created"} ]';
    const res = await request(app)
      .post('/webhooks/spike-api')
      .set('Content-Type', 'text/plain')
      .set('X-Body-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature with 401', async () => {
    expect((await post(RECORD_CHANGE)).status).toBe(401);
  });

  it('rejects an empty signature with 401', async () => {
    expect((await post(RECORD_CHANGE, { 'X-Body-Signature': '' })).status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const res = await post(RECORD_CHANGE, { 'X-Body-Signature': sign(RECORD_CHANGE, 'other') });
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const res = await post(RECORD_CHANGE.replace('User1', 'User9'), {
      'X-Body-Signature': sign(RECORD_CHANGE),
    });
    expect(res.status).toBe(401);
  });

  it.each([
    ['too short', 'abc123'],
    ['too long', 'a'.repeat(65)],
    ['non-hex characters', 'z'.repeat(64)],
    ['prefixed', `sha256=${sign(RECORD_CHANGE)}`],
  ])('rejects a malformed signature (%s)', async (_name, sig) => {
    expect((await post(RECORD_CHANGE, { 'X-Body-Signature': sig })).status).toBe(401);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const body = 'not json';
    expect((await post(body, { 'X-Body-Signature': sign(body) })).status).toBe(400);
  });

  it.each([['an object', '{"event_type":"record_change"}'], ['a string', '"hello"'], ['null', 'null']])(
    'returns 400 when the signed body is %s, not an array',
    async (_name, body) => {
      expect((await post(body, { 'X-Body-Signature': sign(body) })).status).toBe(400);
    }
  );

  it('ignores wrong-typed elements and fields instead of failing', async () => {
    const body = JSON.stringify([
      null,
      'text',
      7,
      [],
      { event_type: 42 },
      { event_type: 'record_change', metrics: 'steps', application_user_id: {}, provider_slug: 5 },
      { event_type: 'record_change', metrics: [1, null, 'steps'] },
    ]);
    const res = await post(body, { 'X-Body-Signature': sign(body) });
    expect(res.status).toBe(200);
  });

  it('accepts an empty array', async () => {
    expect((await post('[]', { 'X-Body-Signature': sign('[]') })).status).toBe(200);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.SPIKE_API_WEBHOOK_SECRET;
    const res = await post(RECORD_CHANGE, { 'X-Body-Signature': sign(RECORD_CHANGE) });
    process.env.SPIKE_API_WEBHOOK_SECRET = SECRET;
    expect(res.status).toBe(500);
  });
});
