const crypto = require('crypto');
const request = require('supertest');

// The webhook secret is an opaque string returned by POST /webhooks and used
// as-is (UTF-8) as the HMAC key.
const TEST_SECRET = 'ltapi_whsec_test_9f2c1b7e4a6d8053';
process.env.LIVE_TENNIS_API_WEBHOOK_SECRET = TEST_SECRET;

const { app, verifyLiveTennisSignature } = require('../src/index');

const now = () => Math.floor(Date.now() / 1000);

function hmacHex(payload, t, secret = TEST_SECRET) {
  return crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
}

// X-LTAPI-Signature-V1: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">
function sign(payload, { t = now(), secret = TEST_SECRET } = {}) {
  return `t=${t},v1=${hmacHex(payload, t, secret)}`;
}

let counter = 0;
const id = () => `test_delivery_${++counter}`;

const FRAMES = {
  score: () => ({ delivery_id: id(), type: 'score', match_id: 4711, sequence: 118 }),
  score_withdrawn: () => ({ delivery_id: id(), type: 'score_withdrawn', match_id: 4711, kind: 'withdrawn', superseded_sequence: 118 }),
  point: () => ({ delivery_id: id(), type: 'point', match_id: 4711, point: { seq: 42 }, pbp_coverage: 'point', quality: 'clean' }),
  break_point: () => ({ delivery_id: id(), type: 'break_point', match_id: 4711, server: 2, returner: 1, break_points: 1 }),
  break_point_result: () => ({ delivery_id: id(), type: 'break_point_result', match_id: 4711, server: 2, outcome: 'broken' }),
  status: () => ({ delivery_id: id(), type: 'status', match_id: 4711 }),
};

function post(payload, headers = {}, contentType = 'application/json') {
  const req = request(app).post('/webhooks/live-tennis-api').set('Content-Type', contentType);
  for (const [name, value] of Object.entries(headers)) req.set(name, value);
  return req.send(payload);
}

describe('Live Tennis API webhook endpoint', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  test('accepts a valid signature', async () => {
    const payload = JSON.stringify(FRAMES.score());
    const res = await post(payload, { 'X-LTAPI-Signature-V1': sign(payload), 'X-LTAPI-Event': 'score' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, event: 'score' });
  });

  test.each(Object.keys(FRAMES))('handles %s frames', async (name) => {
    const payload = JSON.stringify(FRAMES[name]());
    const res = await post(payload, { 'X-LTAPI-Signature-V1': sign(payload), 'X-LTAPI-Event': name });
    expect(res.status).toBe(200);
    expect(res.body.event).toBe(name);
  });

  test('accepts the request when any v1 value matches', async () => {
    const payload = JSON.stringify(FRAMES.score());
    const t = now();
    const header = `t=${t},v1=${hmacHex(payload, t, 'old_secret')},v1=${hmacHex(payload, t)}`;
    const res = await post(payload, { 'X-LTAPI-Signature-V1': header });
    expect(res.status).toBe(200);
  });

  test('acknowledges a repeated delivery_id without handling it again', async () => {
    const payload = JSON.stringify(FRAMES.point());
    const first = await post(payload, { 'X-LTAPI-Signature-V1': sign(payload) });
    const second = await post(payload, { 'X-LTAPI-Signature-V1': sign(payload) });
    expect(first.body).toEqual({ received: true, event: 'point' });
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
  });

  test('falls back to X-LTAPI-Event when the body has no type', async () => {
    const payload = JSON.stringify({ delivery_id: id(), match_id: 4711, outcome: 'held' });
    const res = await post(payload, { 'X-LTAPI-Signature-V1': sign(payload), 'X-LTAPI-Event': 'break_point_result' });
    expect(res.status).toBe(200);
    expect(res.body.event).toBe('break_point_result');
  });

  test('acknowledges unknown events', async () => {
    const payload = JSON.stringify({ delivery_id: id(), type: 'something_new', match_id: 1 });
    const res = await post(payload, { 'X-LTAPI-Signature-V1': sign(payload) });
    expect(res.status).toBe(200);
  });

  test('verifies regardless of content type', async () => {
    for (const type of ['text/plain', 'application/octet-stream', 'application/vnd.api+json']) {
      const payload = JSON.stringify(FRAMES.point());
      const res = await post(payload, { 'X-LTAPI-Signature-V1': sign(payload) }, type);
      expect(res.status).toBe(200);
    }
  });

  test('rejects a timestamp more than 5 minutes old', async () => {
    const payload = JSON.stringify(FRAMES.score());
    const res = await post(payload, { 'X-LTAPI-Signature-V1': sign(payload, { t: now() - 301 }) });
    expect(res.status).toBe(401);
  });

  test('rejects a re-stamped replay', async () => {
    const payload = JSON.stringify(FRAMES.score());
    const old = sign(payload, { t: now() - 600 });
    const restamped = old.replace(/^t=\d+/, `t=${now()}`);
    const res = await post(payload, { 'X-LTAPI-Signature-V1': restamped });
    expect(res.status).toBe(401);
  });

  test('rejects a tampered body', async () => {
    const payload = JSON.stringify(FRAMES.score());
    const tampered = payload.replace('118', '999');
    const res = await post(tampered, { 'X-LTAPI-Signature-V1': sign(payload) });
    expect(res.status).toBe(401);
  });

  test('rejects a signature made with the wrong secret', async () => {
    const payload = JSON.stringify(FRAMES.score());
    const res = await post(payload, { 'X-LTAPI-Signature-V1': sign(payload, { secret: 'another_secret' }) });
    expect(res.status).toBe(401);
  });

  test('does not fall back to the deprecated X-LTAPI-Signature', async () => {
    const payload = JSON.stringify(FRAMES.score());
    const legacy = 'sha256=' + crypto.createHmac('sha256', TEST_SECRET).update(payload).digest('hex');
    const res = await post(payload, { 'X-LTAPI-Signature': legacy });
    expect(res.status).toBe(400);
  });

  test('rejects malformed headers', async () => {
    const payload = JSON.stringify(FRAMES.score());
    const t = now();
    const good = hmacHex(payload, t);
    const bad = [
      `v1=${good}`,
      `t=${t}`,
      `t=abc,v1=${good}`,
      `t=${t},v1=${'z'.repeat(64)}`,
      `t=${t},v1=${good.slice(0, 62)}`,
      `sha256=${good}`,
    ];
    for (const header of bad) {
      const res = await post(payload, { 'X-LTAPI-Signature-V1': header });
      expect(res.status).toBe(401);
    }
  });

  test('rejects a missing header with 400', async () => {
    const res = await post(JSON.stringify(FRAMES.score()));
    expect(res.status).toBe(400);
  });

  test('rejects a valid signature over invalid JSON with 400', async () => {
    const payload = 'not json';
    const res = await post(payload, { 'X-LTAPI-Signature-V1': sign(payload) }, 'text/plain');
    expect(res.status).toBe(400);
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.LIVE_TENNIS_API_WEBHOOK_SECRET;
    const payload = JSON.stringify(FRAMES.score());
    const res = await post(payload, { 'X-LTAPI-Signature-V1': sign(payload) });
    process.env.LIVE_TENNIS_API_WEBHOOK_SECRET = TEST_SECRET;
    expect(res.status).toBe(500);
  });
});

describe('verifyLiveTennisSignature', () => {
  test('returns valid for a correct signature', () => {
    const body = Buffer.from('{"type":"score"}');
    const t = 1790000000;
    expect(verifyLiveTennisSignature(body, sign(body, { t }), TEST_SECRET, t)).toEqual({ valid: true, timestamp: t });
  });

  test('returns invalid for a non-string header', () => {
    expect(verifyLiveTennisSignature(Buffer.from('{}'), undefined, TEST_SECRET).valid).toBe(false);
  });
});
