const crypto = require('crypto');
const request = require('supertest');

const SECRET = 'baseten_test_secret_0123456789';
process.env.BASETEN_WEBHOOK_SECRET = SECRET;

const { app, verifyBasetenSignature } = require('../src/index');

// Payloads follow the sample in https://docs.baseten.co/inference/async
const successEvent = {
  request_id: '9876543210abcdef1234567890fedcba',
  model_id: 'abc123',
  deployment_id: 'def456',
  type: 'async_request_completed',
  time: '2024-04-30T01:01:08.883423Z',
  data: { output: 'model response here' },
  errors: [],
};
const failureEvent = {
  ...successEvent,
  data: null,
  errors: [{ code: 'MODEL_PREDICT_ERROR', message: 'Details here' }],
};

const hexSig = (body, secret = SECRET) =>
  crypto.createHmac('sha256', secret).update(body).digest('hex');
const send = (body, headers = {}) =>
  request(app)
    .post('/webhooks/baseten')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(body);

describe('Baseten webhook handler', () => {
  const body = JSON.stringify(successEvent);

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('accepts a valid v1= signature on a successful request', async () => {
    const res = await send(body, { 'X-BASETEN-SIGNATURE': `v1=${hexSig(body)}` });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, outcome: 'succeeded' });
  });

  it('accepts the bare digest without the v1= prefix', async () => {
    const res = await send(body, { 'X-BASETEN-SIGNATURE': hexSig(body) });
    expect(res.status).toBe(200);
  });

  it('accepts uppercase hex', async () => {
    const res = await send(body, { 'X-BASETEN-SIGNATURE': `v1=${hexSig(body).toUpperCase()}` });
    expect(res.status).toBe(200);
  });

  it('accepts any matching value in a comma-separated header (rotation)', async () => {
    const old = hexSig(body, 'old_secret');
    const res = await send(body, { 'X-BASETEN-SIGNATURE': `v1=${old}, v1=${hexSig(body)}` });
    expect(res.status).toBe(200);
  });

  it('reports a failed request when errors are present', async () => {
    const failed = JSON.stringify(failureEvent);
    const res = await send(failed, { 'X-BASETEN-SIGNATURE': `v1=${hexSig(failed)}` });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('failed');
  });

  it('verifies the exact bytes whatever the content type', async () => {
    const res = await request(app)
      .post('/webhooks/baseten')
      .set('Content-Type', 'text/plain')
      .set('X-BASETEN-SIGNATURE', `v1=${hexSig(body)}`)
      .send(body);
    expect(res.status).toBe(200);
  });

  it('acknowledges unknown event types', async () => {
    const other = JSON.stringify({ ...successEvent, type: 'something_else' });
    const res = await send(other, { 'X-BASETEN-SIGNATURE': `v1=${hexSig(other)}` });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('ignored');
  });

  it('rejects a missing signature header', async () => {
    expect((await send(body)).status).toBe(401);
  });

  it('rejects an empty signature header', async () => {
    expect((await send(body, { 'X-BASETEN-SIGNATURE': '' })).status).toBe(401);
  });

  it('rejects a signature from the wrong secret', async () => {
    const res = await send(body, { 'X-BASETEN-SIGNATURE': `v1=${hexSig(body, 'wrong')}` });
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const sig = `v1=${hexSig(body)}`;
    const res = await send(body.replace('model response', 'tampered'), { 'X-BASETEN-SIGNATURE': sig });
    expect(res.status).toBe(401);
  });

  it('rejects a re-serialized body (whitespace changes the bytes)', async () => {
    const sig = `v1=${hexSig(body)}`;
    const res = await send(JSON.stringify(successEvent, null, 2), { 'X-BASETEN-SIGNATURE': sig });
    expect(res.status).toBe(401);
  });

  it('rejects wrong-length and non-hex signatures', async () => {
    expect((await send(body, { 'X-BASETEN-SIGNATURE': 'v1=abc123' })).status).toBe(401);
    expect((await send(body, { 'X-BASETEN-SIGNATURE': `v1=${'z'.repeat(64)}` })).status).toBe(401);
    expect((await send(body, { 'X-BASETEN-SIGNATURE': `v1=${hexSig(body)}00` })).status).toBe(401);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const bad = 'not json';
    const res = await send(bad, { 'X-BASETEN-SIGNATURE': `v1=${hexSig(bad)}` });
    expect(res.status).toBe(400);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.BASETEN_WEBHOOK_SECRET;
    try {
      const res = await send(body, { 'X-BASETEN-SIGNATURE': `v1=${hexSig(body)}` });
      expect(res.status).toBe(500);
    } finally {
      process.env.BASETEN_WEBHOOK_SECRET = SECRET;
    }
  });

  it('verifyBasetenSignature handles an empty body buffer', () => {
    const empty = Buffer.alloc(0);
    expect(verifyBasetenSignature(empty, `v1=${hexSig(empty)}`, SECRET)).toBe(true);
  });
});
