const request = require('supertest');
const crypto = require('crypto');
const { app } = require('../src/index');

// Shippo HMAC secrets are opaque strings provisioned by Shippo's solutions team.
// The secret is used as-is (UTF-8) as the HMAC key; it is NOT base64-decoded.
const TEST_SECRET = 'test_shippo_hmac_secret';
const TEST_TOKEN = 'test_url_token_123abc';

// Build a Shippo-Auth-Signature header: t=<ts>,v1=hex(HMAC-SHA256(secret, "<ts>.<body>"))
function generateSignature(payload, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

const trackPayload = JSON.stringify({
  event: 'track_updated',
  test: true,
  data: {
    carrier: 'usps',
    tracking_number: '9205590164917312751089',
    tracking_status: { status: 'DELIVERED', status_date: '2016-07-23T00:00:00Z' }
  }
});

function post(payload, { signature, query = '' } = {}) {
  const req = request(app)
    .post(`/webhooks/shippo${query}`)
    .set('Content-Type', 'application/json');
  if (signature) req.set('Shippo-Auth-Signature', signature);
  return req.send(payload);
}

describe('Shippo webhook handler', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('HMAC mode', () => {
    beforeEach(() => {
      process.env.SHIPPO_WEBHOOK_SECRET = TEST_SECRET;
      delete process.env.SHIPPO_WEBHOOK_TOKEN;
      delete process.env.SHIPPO_TIMESTAMP_TOLERANCE_SECONDS;
    });

    test('accepts a valid signature', async () => {
      const res = await post(trackPayload, { signature: generateSignature(trackPayload, TEST_SECRET) });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true, event: 'track_updated' });
    });

    test('rejects a missing signature header', async () => {
      const res = await post(trackPayload);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing Shippo-Auth-Signature header');
    });

    test('rejects a signature made with the wrong secret', async () => {
      const res = await post(trackPayload, { signature: generateSignature(trackPayload, 'wrong_secret') });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid signature');
    });

    test('rejects a tampered body', async () => {
      const signature = generateSignature(trackPayload, TEST_SECRET);
      const tampered = trackPayload.replace('DELIVERED', 'RETURNED');
      const res = await post(tampered, { signature });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid signature');
    });

    test('accepts an old timestamp by default (retries and replays keep the original)', async () => {
      const old = Math.floor(Date.now() / 1000) - 86400;
      const res = await post(trackPayload, { signature: generateSignature(trackPayload, TEST_SECRET, old) });
      expect(res.status).toBe(200);
    });

    test('treats a non-numeric SHIPPO_TIMESTAMP_TOLERANCE_SECONDS as 0 (check off)', async () => {
      process.env.SHIPPO_TIMESTAMP_TOLERANCE_SECONDS = 'five minutes';
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const old = Math.floor(Date.now() / 1000) - 86400;
      const res = await post(trackPayload, { signature: generateSignature(trackPayload, TEST_SECRET, old) });
      expect(res.status).toBe(200);
      warn.mockRestore();
    });

    test('rejects an old timestamp when SHIPPO_TIMESTAMP_TOLERANCE_SECONDS is set', async () => {
      process.env.SHIPPO_TIMESTAMP_TOLERANCE_SECONDS = '300';
      const old = Math.floor(Date.now() / 1000) - 600;
      const res = await post(trackPayload, { signature: generateSignature(trackPayload, TEST_SECRET, old) });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Timestamp outside tolerance');
    });

    test('rejects a malformed header', async () => {
      const res = await post(trackPayload, { signature: 'garbage' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Malformed Shippo-Auth-Signature header');
    });

    test('rejects a base64 signature (Shippo uses hex)', async () => {
      const ts = Math.floor(Date.now() / 1000);
      const b64 = crypto.createHmac('sha256', TEST_SECRET).update(`${ts}.${trackPayload}`).digest('base64');
      const res = await post(trackPayload, { signature: `t=${ts},v1=${b64}` });
      expect(res.status).toBe(400);
    });

    test('accepts when any of multiple v1 signatures matches', async () => {
      const ts = Math.floor(Date.now() / 1000);
      const good = generateSignature(trackPayload, TEST_SECRET, ts).split('v1=')[1];
      const res = await post(trackPayload, { signature: `t=${ts},v1=${'0'.repeat(64)},v1=${good}` });
      expect(res.status).toBe(200);
    });

    test('rejects invalid JSON even with a valid signature', async () => {
      const body = 'not json';
      const res = await post(body, { signature: generateSignature(body, TEST_SECRET) });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid JSON payload');
    });

    test.each([
      ['track_updated', { tracking_number: '123', tracking_status: { status: 'TRANSIT' } }],
      ['transaction_created', { object_id: 'abc', status: 'SUCCESS', tracking_number: '9499' }],
      ['transaction_updated', { object_id: 'abc', status: 'REFUNDED' }],
      ['batch_created', 'batch # created'],
      ['batch_purchased', 'batch # processing complete'],
      ['automations_label_resolved', { request_id: 'b3b8f6b0', status: 'purchased' }],
      ['some_future_event', {}]
    ])('handles %s', async (event, data) => {
      const payload = JSON.stringify({ event, test: true, data });
      const res = await post(payload, { signature: generateSignature(payload, TEST_SECRET) });
      expect(res.status).toBe(200);
      expect(res.body.event).toBe(event);
    });
  });

  describe('URL token mode (no HMAC)', () => {
    beforeEach(() => {
      delete process.env.SHIPPO_WEBHOOK_SECRET;
      process.env.SHIPPO_WEBHOOK_TOKEN = TEST_TOKEN;
    });

    test('accepts the correct token', async () => {
      const res = await post(trackPayload, { query: `?token=${TEST_TOKEN}` });
      expect(res.status).toBe(200);
    });

    test('rejects a wrong token', async () => {
      const res = await post(trackPayload, { query: '?token=nope' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid token');
    });

    test('rejects a missing token', async () => {
      const res = await post(trackPayload);
      expect(res.status).toBe(400);
    });
  });

  describe('combined HMAC + token', () => {
    beforeEach(() => {
      process.env.SHIPPO_WEBHOOK_SECRET = TEST_SECRET;
      process.env.SHIPPO_WEBHOOK_TOKEN = TEST_TOKEN;
    });

    test('requires both to pass', async () => {
      const signature = generateSignature(trackPayload, TEST_SECRET);
      expect((await post(trackPayload, { signature, query: `?token=${TEST_TOKEN}` })).status).toBe(200);
      expect((await post(trackPayload, { signature, query: '?token=nope' })).status).toBe(400);
      expect((await post(trackPayload, { query: `?token=${TEST_TOKEN}` })).status).toBe(400);
    });
  });

  test('returns 500 when neither secret nor token is configured', async () => {
    delete process.env.SHIPPO_WEBHOOK_SECRET;
    delete process.env.SHIPPO_WEBHOOK_TOKEN;
    const res = await post(trackPayload);
    expect(res.status).toBe(500);
  });

  test('health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
