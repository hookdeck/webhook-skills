const request = require('supertest');
const crypto = require('crypto');

process.env.METRONOME_WEBHOOK_SECRET = 'correct-horse-battery-staple';

const {
  app,
  buildSignedBytes,
  computeMetronomeSignature,
  verifyMetronomeSignature,
  isDateWithinTolerance,
  seenEventIds,
} = require('../src/index');

const secret = process.env.METRONOME_WEBHOOK_SECRET;
const DATE = 'Mon, 02 Jan 2006 22:04:05 GMT';

// Published test vector from Metronome's docs (setup-webhooks#verify-signatures).
// The body is pretty-printed exactly as the docs show it, with no trailing newline.
const VECTOR_BODY =
  '{\n  "id": "b2c9e307-624e-4e7d-a5a4-1b74107d78c4",\n  "type": "widget_created",\n  "properties": {\n    "customer_id": "5f794d50-085a-4db6-8d15-286e518b7225",\n    "widget_id": "0891458d-b6f0-4fdd-a41e-380aae1a1e38"\n  }\n}';
const VECTOR_SIGNATURE = 'b82652fa2246cf1d8a27e591f155c865f68b46c19b9213fd9c052f2419b4742b';

// Sign like Metronome: HMAC-SHA256(secret, X-Metronome-Date + "\n" + body), hex
function sign(payload, date = DATE, key = secret) {
  return crypto
    .createHmac('sha256', key)
    .update(Buffer.concat([Buffer.from(date, 'latin1'), Buffer.from([0x0a]), Buffer.from(payload)]))
    .digest('hex');
}

// Payload based on the docs' alerts.spend_threshold_reached example
const spendAlert = (id = 'a1b2c3d4-0000-4000-8000-000000000001') =>
  JSON.stringify({
    id,
    properties: {
      customer_id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
      alert_id: '7f8a9b2c-3d4e-4f5a-8b9c-0d1e2f3a4b5c',
      timestamp: '2024-10-07T16:30:15.123Z',
      threshold: 10000,
      alert_name: 'Spend threshold exceeded',
      current_spend: 12500,
      triggered_by: 'usage',
    },
    type: 'alerts.spend_threshold_reached',
  });

function post(payload, headers = {}) {
  return request(app)
    .post('/webhooks/metronome')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(payload);
}

beforeEach(() => {
  seenEventIds.clear();
  delete process.env.METRONOME_WEBHOOK_TOLERANCE_SECONDS;
});

describe('published test vector', () => {
  it('computes the documented signature', () => {
    expect(computeMetronomeSignature(Buffer.from(VECTOR_BODY), DATE, secret)).toBe(VECTOR_SIGNATURE);
  });

  it('accepts the documented headers and secret', () => {
    expect(verifyMetronomeSignature(Buffer.from(VECTOR_BODY), VECTOR_SIGNATURE, DATE, secret)).toBe(true);
  });

  it('accepts the vector through the endpoint', async () => {
    const res = await post(VECTOR_BODY, {
      'X-Metronome-Date': DATE,
      'Metronome-Webhook-Signature': VECTOR_SIGNATURE,
    });
    expect(res.status).toBe(200);
  });
});

describe('signed bytes', () => {
  it('separates the date and the body with a real LF, not backslash-n', () => {
    const bytes = buildSignedBytes(Buffer.from('{}'), DATE);
    expect(bytes.includes(0x0a)).toBe(true);
    expect(bytes.includes(Buffer.from('\\n'))).toBe(false);
    expect(bytes.toString('latin1')).toBe(`${DATE}\n{}`);
  });

  it('keeps the body bytes untouched (non-UTF-8 bytes survive)', () => {
    const body = Buffer.from([0x7b, 0xff, 0xfe, 0x7d]);
    const bytes = buildSignedBytes(body, DATE);
    expect(bytes.subarray(bytes.length - 4).equals(body)).toBe(true);
  });
});

describe('verifyMetronomeSignature', () => {
  const body = Buffer.from(spendAlert());

  it('accepts a valid signature', () => {
    expect(verifyMetronomeSignature(body, sign(body), DATE, secret)).toBe(true);
  });

  it('accepts uppercase hex', () => {
    expect(verifyMetronomeSignature(body, sign(body).toUpperCase(), DATE, secret)).toBe(true);
  });

  it('rejects a missing or empty signature, date or secret', () => {
    expect(verifyMetronomeSignature(body, undefined, DATE, secret)).toBe(false);
    expect(verifyMetronomeSignature(body, '', DATE, secret)).toBe(false);
    expect(verifyMetronomeSignature(body, sign(body), undefined, secret)).toBe(false);
    expect(verifyMetronomeSignature(body, sign(body), '', secret)).toBe(false);
    expect(verifyMetronomeSignature(body, sign(body), DATE, undefined)).toBe(false);
  });

  it('rejects malformed signatures (length, alphabet, prefix, list)', () => {
    const good = sign(body);
    expect(verifyMetronomeSignature(body, good.slice(0, 62), DATE, secret)).toBe(false);
    expect(verifyMetronomeSignature(body, good + '00', DATE, secret)).toBe(false);
    expect(verifyMetronomeSignature(body, 'g'.repeat(64), DATE, secret)).toBe(false);
    expect(verifyMetronomeSignature(body, `sha256=${good}`, DATE, secret)).toBe(false);
    expect(verifyMetronomeSignature(body, `${good}, ${good}`, DATE, secret)).toBe(false);
  });

  it('rejects a tampered body', () => {
    expect(verifyMetronomeSignature(Buffer.from(spendAlert('other')), sign(body), DATE, secret)).toBe(false);
  });

  it('rejects a different date or secret', () => {
    expect(verifyMetronomeSignature(body, sign(body), 'Tue, 03 Jan 2006 22:04:05 GMT', secret)).toBe(false);
    expect(verifyMetronomeSignature(body, sign(body, DATE, 'wrong'), DATE, secret)).toBe(false);
  });
});

describe('isDateWithinTolerance', () => {
  const now = Date.parse(DATE);

  it('is off by default', () => {
    expect(isDateWithinTolerance(DATE, 0, now + 10 * 24 * 3600 * 1000)).toBe(true);
  });

  it('enforces the window when set', () => {
    expect(isDateWithinTolerance(DATE, 300, now + 60 * 1000)).toBe(true);
    expect(isDateWithinTolerance(DATE, 300, now + 600 * 1000)).toBe(false);
    expect(isDateWithinTolerance('not a date', 300, now)).toBe(false);
  });
});

describe('POST /webhooks/metronome', () => {
  it('accepts a valid webhook', async () => {
    const payload = spendAlert();
    const res = await post(payload, { 'X-Metronome-Date': DATE, 'Metronome-Webhook-Signature': sign(payload) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('verifies any content type against the exact bytes', async () => {
    const payload = spendAlert('a1b2c3d4-0000-4000-8000-000000000002');
    const res = await request(app)
      .post('/webhooks/metronome')
      .set('Content-Type', 'text/plain')
      .set({ 'X-Metronome-Date': DATE, 'Metronome-Webhook-Signature': sign(payload) })
      .send(payload);
    expect(res.status).toBe(200);
  });

  it('returns 401 for a missing signature header', async () => {
    const res = await post(spendAlert(), { 'X-Metronome-Date': DATE });
    expect(res.status).toBe(401);
  });

  it('returns 401 for a missing X-Metronome-Date header', async () => {
    const payload = spendAlert();
    const res = await post(payload, { 'Metronome-Webhook-Signature': sign(payload) });
    expect(res.status).toBe(401);
  });

  it('returns 401 for a signature made over the standard Date header value', async () => {
    const payload = spendAlert();
    const res = await post(payload, {
      'X-Metronome-Date': DATE,
      Date: 'Tue, 03 Jan 2006 22:04:05 GMT',
      'Metronome-Webhook-Signature': sign(payload, 'Tue, 03 Jan 2006 22:04:05 GMT'),
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 for a bad signature', async () => {
    const res = await post(spendAlert(), { 'X-Metronome-Date': DATE, 'Metronome-Webhook-Signature': 'a'.repeat(64) });
    expect(res.status).toBe(401);
  });

  it('returns 401 for a body-less request with a signature for another body', async () => {
    const res = await request(app)
      .post('/webhooks/metronome')
      .set({ 'X-Metronome-Date': DATE, 'Metronome-Webhook-Signature': sign(spendAlert()) });
    expect(res.status).toBe(401);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const payload = 'not json';
    const res = await post(payload, { 'X-Metronome-Date': DATE, 'Metronome-Webhook-Signature': sign(payload) });
    expect(res.status).toBe(400);
  });

  it('acknowledges but does not reprocess a duplicate id', async () => {
    const payload = spendAlert('a1b2c3d4-0000-4000-8000-000000000003');
    const headers = { 'X-Metronome-Date': DATE, 'Metronome-Webhook-Signature': sign(payload) };
    expect((await post(payload, headers)).body).toEqual({ received: true });
    expect((await post(payload, headers)).body).toEqual({ received: true, duplicate: true });
  });

  it('accepts an old X-Metronome-Date when no tolerance is set (retries)', async () => {
    const payload = spendAlert();
    const res = await post(payload, { 'X-Metronome-Date': DATE, 'Metronome-Webhook-Signature': sign(payload) });
    expect(res.status).toBe(200);
  });

  it('rejects an old X-Metronome-Date when tolerance is set', async () => {
    process.env.METRONOME_WEBHOOK_TOLERANCE_SECONDS = '300';
    const payload = spendAlert();
    const res = await post(payload, { 'X-Metronome-Date': DATE, 'Metronome-Webhook-Signature': sign(payload) });
    expect(res.status).toBe(401);
  });

  it('handles flat contract events and unknown types', async () => {
    for (const event of [
      { id: 'c-1', type: 'contract.create', contract_id: 'k1', customer_id: 'u1' },
      { id: 'c-2', type: 'some.future_event' },
    ]) {
      const payload = JSON.stringify(event);
      const res = await post(payload, { 'X-Metronome-Date': DATE, 'Metronome-Webhook-Signature': sign(payload) });
      expect(res.status).toBe(200);
    }
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
