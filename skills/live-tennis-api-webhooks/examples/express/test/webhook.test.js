const crypto = require('crypto');
const request = require('supertest');

// The webhook secret is an opaque string returned by POST /webhooks and used
// as-is (UTF-8) as the HMAC key.
const TEST_SECRET = 'ltapi_whsec_test_9f2c1b7e4a6d8053';
process.env.LIVE_TENNIS_API_WEBHOOK_SECRET = TEST_SECRET;

const { app, verifyLiveTennisSignature } = require('../src/index');

// X-LTAPI-Signature: sha256=<hex HMAC-SHA256 of the raw body>
function sign(payload, secret = TEST_SECRET) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

const FRAMES = {
  score: { type: 'score', match_id: 4711, sets: [1, 0], games: [[6, 3], [2, 1]], points: { p1: '30', p2: '15' }, server: 1, is_tiebreak: false, sequence: 118 },
  point: { type: 'point', match_id: 4711, point: { seq: 42, set: 2, game: 4, number: 3, tiebreak: false, server: 1, winner: 1, score: { p1: '40', p2: '15' } }, pbp_coverage: 'point', quality: 'clean' },
  break_point: { type: 'break_point', match_id: 4711, server: 2, returner: 1, break_points: 1, set: 2, game: 5, point: '30-40', win_probability_p1: 0.61 },
  break_point_result: { type: 'break_point_result', match_id: 4711, server: 2, outcome: 'broken', win_probability_p1_after: 0.72 },
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
    const payload = JSON.stringify(FRAMES.score);
    const res = await post(payload, { 'X-LTAPI-Signature': sign(payload), 'X-LTAPI-Event': 'score' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, event: 'score' });
  });

  test.each(Object.keys(FRAMES))('handles %s frames', async (name) => {
    const payload = JSON.stringify(FRAMES[name]);
    const res = await post(payload, { 'X-LTAPI-Signature': sign(payload), 'X-LTAPI-Event': name });
    expect(res.status).toBe(200);
    expect(res.body.event).toBe(name);
  });

  test('falls back to X-LTAPI-Event when the body has no type', async () => {
    const payload = JSON.stringify({ match_id: 4711, outcome: 'held' });
    const res = await post(payload, { 'X-LTAPI-Signature': sign(payload), 'X-LTAPI-Event': 'break_point_result' });
    expect(res.status).toBe(200);
    expect(res.body.event).toBe('break_point_result');
  });

  test('acknowledges unknown events', async () => {
    const payload = JSON.stringify({ type: 'something_new', match_id: 1 });
    const res = await post(payload, { 'X-LTAPI-Signature': sign(payload) });
    expect(res.status).toBe(200);
  });

  test('accepts uppercase hex digests', async () => {
    const payload = JSON.stringify(FRAMES.score);
    const upper = 'sha256=' + sign(payload).slice('sha256='.length).toUpperCase();
    const res = await post(payload, { 'X-LTAPI-Signature': upper });
    expect(res.status).toBe(200);
  });

  test('verifies regardless of content type', async () => {
    const payload = JSON.stringify(FRAMES.point);
    for (const type of ['text/plain', 'application/octet-stream', 'application/vnd.api+json']) {
      const res = await post(payload, { 'X-LTAPI-Signature': sign(payload) }, type);
      expect(res.status).toBe(200);
    }
  });

  test('ignores X-LTAPI-Timestamp, which is not signed', async () => {
    const payload = JSON.stringify(FRAMES.score);
    const res = await post(payload, { 'X-LTAPI-Signature': sign(payload), 'X-LTAPI-Timestamp': '1' });
    expect(res.status).toBe(200);
  });

  test('rejects a tampered body', async () => {
    const payload = JSON.stringify(FRAMES.score);
    const tampered = JSON.stringify({ ...FRAMES.score, sequence: 999 });
    const res = await post(tampered, { 'X-LTAPI-Signature': sign(payload) });
    expect(res.status).toBe(401);
  });

  test('rejects a signature made with the wrong secret', async () => {
    const payload = JSON.stringify(FRAMES.score);
    const res = await post(payload, { 'X-LTAPI-Signature': sign(payload, 'another_secret') });
    expect(res.status).toBe(401);
  });

  test('rejects a missing header with 400', async () => {
    const res = await post(JSON.stringify(FRAMES.score));
    expect(res.status).toBe(400);
  });

  test('rejects a digest without the sha256= prefix', async () => {
    const payload = JSON.stringify(FRAMES.score);
    const bare = sign(payload).slice('sha256='.length);
    const res = await post(payload, { 'X-LTAPI-Signature': bare });
    expect(res.status).toBe(401);
  });

  test('rejects non-hex and wrong-length digests', async () => {
    const payload = JSON.stringify(FRAMES.score);
    const good = sign(payload).slice('sha256='.length);
    const bad = [
      'sha256=' + 'z'.repeat(64),
      'sha256=' + good.slice(0, 62),
      'sha256=' + good + '00',
      'sha256=',
      'sha1=' + good,
    ];
    for (const header of bad) {
      const res = await post(payload, { 'X-LTAPI-Signature': header });
      expect(res.status).toBe(401);
    }
  });

  test('rejects a valid signature over invalid JSON with 400', async () => {
    const payload = 'not json';
    const res = await post(payload, { 'X-LTAPI-Signature': sign(payload) }, 'text/plain');
    expect(res.status).toBe(400);
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.LIVE_TENNIS_API_WEBHOOK_SECRET;
    const payload = JSON.stringify(FRAMES.score);
    const res = await post(payload, { 'X-LTAPI-Signature': sign(payload) });
    process.env.LIVE_TENNIS_API_WEBHOOK_SECRET = TEST_SECRET;
    expect(res.status).toBe(500);
  });
});

describe('verifyLiveTennisSignature', () => {
  test('returns valid for a correct signature', () => {
    const body = Buffer.from('{"type":"score"}');
    expect(verifyLiveTennisSignature(body, sign(body), TEST_SECRET)).toEqual({ valid: true });
  });

  test('returns invalid for a non-string header', () => {
    expect(verifyLiveTennisSignature(Buffer.from('{}'), undefined, TEST_SECRET).valid).toBe(false);
  });
});
