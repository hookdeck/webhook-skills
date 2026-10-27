const crypto = require('crypto');
const request = require('supertest');

const TEST_SECRET = 'test_ultravox_webhook_secret';
process.env.ULTRAVOX_WEBHOOK_SECRET = TEST_SECRET;

const { app } = require('../src/index');

// Sign exactly as Ultravox does: hex HMAC-SHA256(secret, body bytes + timestamp string, no separator)
function sign(body, timestamp, secret = TEST_SECRET) {
  return crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(body), Buffer.from(timestamp, 'latin1')]))
    .digest('hex');
}

function post(body, { timestamp = new Date().toISOString(), signature, headers = {} } = {}) {
  const req = request(app).post('/webhooks/ultravox').set('Content-Type', 'application/json');
  const sig = signature === undefined ? sign(body, timestamp) : signature;
  if (sig !== null) req.set('X-Ultravox-Webhook-Signature', sig);
  if (timestamp !== null) req.set('X-Ultravox-Webhook-Timestamp', timestamp);
  Object.entries(headers).forEach(([k, v]) => req.set(k, v));
  return req.send(body);
}

const event = (name) => JSON.stringify({ event: name });

describe('Ultravox webhook', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.ULTRAVOX_WEBHOOK_TOLERANCE_SECONDS;
  });

  test.each(['call.started', 'call.joined', 'call.ended', 'call.billed'])(
    'accepts a signed %s event with 204',
    async (name) => {
      const res = await post(event(name));
      expect(res.status).toBe(204);
    }
  );

  test('accepts and logs unknown events', async () => {
    const res = await post(event('call.something_new'));
    expect(res.status).toBe(204);
  });

  test('verifies the exact raw bytes (whitespace preserved)', async () => {
    const res = await post('{ "event" :  "call.ended" }\n');
    expect(res.status).toBe(204);
  });

  test('accepts an uppercase hex signature', async () => {
    const body = event('call.started');
    const ts = new Date().toISOString();
    const res = await post(body, { timestamp: ts, signature: sign(body, ts).toUpperCase() });
    expect(res.status).toBe(204);
  });

  test('rejects a missing signature', async () => {
    const res = await post(event('call.ended'), { signature: null });
    expect(res.status).toBe(401);
  });

  test('rejects an empty signature', async () => {
    const res = await post(event('call.ended'), { signature: '' });
    expect(res.status).toBe(401);
  });

  test('rejects a missing timestamp', async () => {
    const res = await post(event('call.ended'), { timestamp: null, signature: 'a'.repeat(64) });
    expect(res.status).toBe(401);
  });

  test('rejects a wrong signature', async () => {
    const res = await post(event('call.ended'), { signature: 'a'.repeat(64) });
    expect(res.status).toBe(401);
  });

  test('rejects a signature made with another secret', async () => {
    const body = event('call.ended');
    const ts = new Date().toISOString();
    const res = await post(body, { timestamp: ts, signature: sign(body, ts, 'other_secret') });
    expect(res.status).toBe(401);
  });

  test('rejects a tampered body', async () => {
    const ts = new Date().toISOString();
    const signature = sign(event('call.ended'), ts);
    const res = await post(event('call.billed'), { timestamp: ts, signature });
    expect(res.status).toBe(401);
  });

  test('rejects a tampered timestamp', async () => {
    const body = event('call.ended');
    const signature = sign(body, '2026-01-01T00:00:00.000Z');
    const res = await post(body, { timestamp: '2026-01-01T00:00:01.000Z', signature });
    expect(res.status).toBe(401);
  });

  test('rejects malformed signatures (length, alphabet, prefix, list)', async () => {
    const body = event('call.ended');
    const ts = new Date().toISOString();
    const good = sign(body, ts);
    for (const signature of [
      good.slice(0, 62),
      good + '00',
      'z'.repeat(64),
      `sha256=${good}`,
      `${good},${good}`,
    ]) {
      const res = await post(body, { timestamp: ts, signature });
      expect(res.status).toBe(401);
    }
  });

  test('does not reject old timestamps by default (retries and replays)', async () => {
    const body = event('call.ended');
    const ts = '2020-01-01T00:00:00.000Z';
    const res = await post(body, { timestamp: ts });
    expect(res.status).toBe(204);
  });

  test('rejects old timestamps when the tolerance is enabled', async () => {
    process.env.ULTRAVOX_WEBHOOK_TOLERANCE_SECONDS = '60';
    const old = await post(event('call.ended'), { timestamp: '2020-01-01T00:00:00.000Z' });
    expect(old.status).toBe(401);
    const fresh = await post(event('call.ended'));
    expect(fresh.status).toBe(204);
  });

  test('returns 400 for a signed body that is not JSON', async () => {
    const res = await post('not json');
    expect(res.status).toBe(400);
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.ULTRAVOX_WEBHOOK_SECRET;
    const res = await post(event('call.ended'));
    process.env.ULTRAVOX_WEBHOOK_SECRET = TEST_SECRET;
    expect(res.status).toBe(500);
  });

  test('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
