const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app
process.env.WHOOP_WEBHOOK_SECRET = 'test_client_secret';
delete process.env.WHOOP_WEBHOOK_TOLERANCE_SECONDS;

const { app, verifyWhoopSignature, isTimestampFresh } = require('../src/index');

const secret = process.env.WHOOP_WEBHOOK_SECRET;

// Doc example payload (sleep.updated)
const sleepPayload = {
  user_id: 456,
  id: '550e8400-e29b-41d4-a716-446655440000',
  type: 'sleep.updated',
  trace_id: 'e369c784-5100-49e8-8098-75d35c47b31b',
};

/** base64(HMAC-SHA256(secret, timestamp + rawBody)), no separator */
function sign(body, timestamp, key = secret) {
  return crypto
    .createHmac('sha256', key)
    .update(Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from(body)]))
    .digest('base64');
}

function send(body, { timestamp = String(Date.now()), signature, contentType = 'application/json' } = {}) {
  const req = request(app).post('/webhooks/whoop').set('Content-Type', contentType);
  req.set('X-WHOOP-Signature', signature ?? sign(body, timestamp));
  if (timestamp !== null) req.set('X-WHOOP-Signature-Timestamp', timestamp);
  return req.send(body);
}

describe('verifyWhoopSignature', () => {
  const ts = '1700000000000';
  const body = Buffer.from(JSON.stringify(sleepPayload));

  it('accepts a valid signature', () => {
    expect(verifyWhoopSignature(body, sign(body, ts), ts, secret)).toBe(true);
  });

  it('rejects a signature made with another secret', () => {
    expect(verifyWhoopSignature(body, sign(body, ts, 'other'), ts, secret)).toBe(false);
  });

  it('rejects a different timestamp', () => {
    expect(verifyWhoopSignature(body, sign(body, ts), '1700000000001', secret)).toBe(false);
  });

  it('rejects a tampered body', () => {
    expect(verifyWhoopSignature(Buffer.from('{}'), sign(body, ts), ts, secret)).toBe(false);
  });

  it('rejects missing signature, timestamp or secret', () => {
    const sig = sign(body, ts);
    expect(verifyWhoopSignature(body, undefined, ts, secret)).toBe(false);
    expect(verifyWhoopSignature(body, '', ts, secret)).toBe(false);
    expect(verifyWhoopSignature(body, sig, undefined, secret)).toBe(false);
    expect(verifyWhoopSignature(body, sig, '', secret)).toBe(false);
    expect(verifyWhoopSignature(body, sig, ts, undefined)).toBe(false);
  });

  it('rejects malformed signatures without throwing', () => {
    const sig = sign(body, ts);
    expect(verifyWhoopSignature(body, sig.slice(0, -1), ts, secret)).toBe(false); // short
    expect(verifyWhoopSignature(body, sig.replace(/=$/, ''), ts, secret)).toBe(false); // unpadded
    expect(verifyWhoopSignature(body, sig.slice(0, 43) + '!', ts, secret)).toBe(false);
    expect(verifyWhoopSignature(body, sig + sig, ts, secret)).toBe(false); // list-like
    expect(verifyWhoopSignature(body, 'sha256=' + sig, ts, secret)).toBe(false); // prefix
  });

  it('compares base64 case-sensitively', () => {
    const sig = sign(body, ts);
    expect(verifyWhoopSignature(body, sig.toLowerCase(), ts, secret)).toBe(false);
  });
});

describe('isTimestampFresh', () => {
  const now = 1700000000000;

  it('is off by default', () => {
    expect(isTimestampFresh('1', undefined, now)).toBe(true);
    expect(isTimestampFresh('1', 0, now)).toBe(true);
    expect(isTimestampFresh('1', NaN, now)).toBe(true);
  });

  it('uses milliseconds when enabled', () => {
    expect(isTimestampFresh(String(now - 299000), 300, now)).toBe(true);
    expect(isTimestampFresh(String(now - 301000), 300, now)).toBe(false);
    expect(isTimestampFresh(String(now + 301000), 300, now)).toBe(false);
    expect(isTimestampFresh('not-a-number', 300, now)).toBe(false);
  });
});

describe('POST /webhooks/whoop', () => {
  const body = JSON.stringify(sleepPayload);

  it('returns 200 for a valid webhook', async () => {
    const res = await send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('verifies the raw bytes whatever the content type', async () => {
    const res = await send(body, { contentType: 'text/plain' });
    expect(res.status).toBe(200);
  });

  it('verifies bodies whose whitespace and non-ASCII bytes would not survive re-serialization', async () => {
    const raw = '{ "user_id": 456,  "id": "550e8400-e29b-41d4-a716-446655440000", "type": "sleep.updated", "note": "héllo" }';
    const res = await send(raw);
    expect(res.status).toBe(200);
  });

  it('accepts old timestamps by default (retries and replays)', async () => {
    const res = await send(body, { timestamp: '1700000000000' });
    expect(res.status).toBe(200);
  });

  it('returns 401 for an invalid signature', async () => {
    const res = await send(body, { signature: 'A'.repeat(43) + '=' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for a malformed signature', async () => {
    const res = await send(body, { signature: 'not-base64' });
    expect(res.status).toBe(401);
  });

  it('returns 401 when the signature header is missing', async () => {
    const res = await request(app)
      .post('/webhooks/whoop')
      .set('Content-Type', 'application/json')
      .set('X-WHOOP-Signature-Timestamp', String(Date.now()))
      .send(body);
    expect(res.status).toBe(401);
  });

  it('returns 401 when the timestamp header is missing', async () => {
    const res = await send(body, { timestamp: null, signature: sign(body, '') });
    expect(res.status).toBe(401);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const res = await send('not json');
    expect(res.status).toBe(400);
  });

  it.each([
    'sleep.updated', 'sleep.deleted', 'workout.updated', 'workout.deleted',
    'recovery.updated', 'recovery.deleted', 'something.new',
  ])('acknowledges %s', async (type) => {
    const res = await send(JSON.stringify({ ...sleepPayload, type }));
    expect(res.status).toBe(200);
  });

  describe('with a tolerance configured', () => {
    beforeAll(() => { process.env.WHOOP_WEBHOOK_TOLERANCE_SECONDS = '300'; });
    afterAll(() => { delete process.env.WHOOP_WEBHOOK_TOLERANCE_SECONDS; });

    it('accepts a fresh timestamp', async () => {
      const res = await send(body);
      expect(res.status).toBe(200);
    });

    it('rejects a stale timestamp even when correctly signed', async () => {
      const res = await send(body, { timestamp: String(Date.now() - 3600 * 1000) });
      expect(res.status).toBe(401);
    });
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
