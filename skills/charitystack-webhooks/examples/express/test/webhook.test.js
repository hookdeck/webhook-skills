const request = require('supertest');
const crypto = require('crypto');

const SECRET = 'cs_whsec_test_secret_key';

process.env.CHARITYSTACK_WEBHOOK_SECRET = SECRET;
delete process.env.CHARITYSTACK_WEBHOOK_TOLERANCE_SECONDS;

const app = require('../src/index');
const { verifyCharityStackSignature } = require('../src/index');

// Matches CharityStack's algorithm: HMAC-SHA256 over `${timestamp}.${raw body}`, hex.
function sign(body, timestamp, secret = SECRET) {
  return crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(`${timestamp}.`), Buffer.from(body)]))
    .digest('hex');
}

const now = () => String(Math.floor(Date.now() / 1000));

function post(body, headers, contentType = 'application/json') {
  return request(app)
    .post('/webhooks/charitystack')
    .set('Content-Type', contentType)
    .set(headers)
    .send(body);
}

describe('CharityStack webhook endpoint', () => {
  afterEach(() => {
    delete process.env.CHARITYSTACK_WEBHOOK_TOLERANCE_SECONDS;
  });

  const body = JSON.stringify({ type: 'donation.created', data: { note: 'Spenden für alle' } });

  test('accepts a valid sha256= signature', async () => {
    const ts = now();
    const res = await post(body, {
      'X-Webhook-Signature': `sha256=${sign(body, ts)}`,
      'X-Webhook-Timestamp': ts,
      'X-Webhook-ID': 'del_1',
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  test('accepts a bare hex digest', async () => {
    const ts = now();
    const res = await post(body, {
      'X-Webhook-Signature': sign(body, ts),
      'X-Webhook-Timestamp': ts,
    });
    expect(res.status).toBe(200);
  });

  test('compares hex case-insensitively', async () => {
    const ts = now();
    const res = await post(body, {
      'X-Webhook-Signature': `sha256=${sign(body, ts).toUpperCase()}`,
      'X-Webhook-Timestamp': ts,
    });
    expect(res.status).toBe(200);
  });

  test('verifies the raw bytes whatever the content type', async () => {
    const ts = now();
    const res = await post(
      body,
      { 'X-Webhook-Signature': `sha256=${sign(body, ts)}`, 'X-Webhook-Timestamp': ts },
      'text/plain'
    );
    expect(res.status).toBe(200);
  });

  test('rejects a missing signature header', async () => {
    const res = await post(body, { 'X-Webhook-Timestamp': now() });
    expect(res.status).toBe(401);
  });

  test('rejects a missing timestamp header', async () => {
    const res = await post(body, { 'X-Webhook-Signature': `sha256=${sign(body, now())}` });
    expect(res.status).toBe(401);
  });

  test('rejects a malformed signature', async () => {
    const ts = now();
    for (const sig of ['sha256=', 'sha256=zz', `sha256=${'g'.repeat(64)}`, `sha256=${sign(body, ts)}00`]) {
      const res = await post(body, { 'X-Webhook-Signature': sig, 'X-Webhook-Timestamp': ts });
      expect(res.status).toBe(401);
    }
  });

  test('rejects a signature made with another secret', async () => {
    const ts = now();
    const res = await post(body, {
      'X-Webhook-Signature': `sha256=${sign(body, ts, 'other_secret')}`,
      'X-Webhook-Timestamp': ts,
    });
    expect(res.status).toBe(401);
  });

  test('rejects a tampered body', async () => {
    const ts = now();
    const res = await post(JSON.stringify({ type: 'donation.updated' }), {
      'X-Webhook-Signature': `sha256=${sign(body, ts)}`,
      'X-Webhook-Timestamp': ts,
    });
    expect(res.status).toBe(401);
  });

  test('rejects a re-serialised body', async () => {
    const pretty = JSON.stringify(JSON.parse(body), null, 2);
    const ts = now();
    const res = await post(pretty, {
      'X-Webhook-Signature': `sha256=${sign(body, ts)}`,
      'X-Webhook-Timestamp': ts,
    });
    expect(res.status).toBe(401);
  });

  test('rejects a timestamp that was not the one signed', async () => {
    const ts = now();
    const res = await post(body, {
      'X-Webhook-Signature': `sha256=${sign(body, ts)}`,
      'X-Webhook-Timestamp': String(Number(ts) + 1),
    });
    expect(res.status).toBe(401);
  });

  test('accepts old timestamps by default (retries and replays)', async () => {
    const ts = String(Math.floor(Date.now() / 1000) - 86400);
    const res = await post(body, {
      'X-Webhook-Signature': `sha256=${sign(body, ts)}`,
      'X-Webhook-Timestamp': ts,
    });
    expect(res.status).toBe(200);
  });

  test('rejects old timestamps when the tolerance is enabled', async () => {
    process.env.CHARITYSTACK_WEBHOOK_TOLERANCE_SECONDS = '300';
    const old = String(Math.floor(Date.now() / 1000) - 3600);
    const stale = await post(body, {
      'X-Webhook-Signature': `sha256=${sign(body, old)}`,
      'X-Webhook-Timestamp': old,
    });
    expect(stale.status).toBe(401);

    const ts = now();
    const fresh = await post(body, {
      'X-Webhook-Signature': `sha256=${sign(body, ts)}`,
      'X-Webhook-Timestamp': ts,
    });
    expect(fresh.status).toBe(200);
  });

  test('returns 400 for a validly signed non-JSON body', async () => {
    const ts = now();
    const res = await post('not json', {
      'X-Webhook-Signature': `sha256=${sign('not json', ts)}`,
      'X-Webhook-Timestamp': ts,
    });
    expect(res.status).toBe(400);
  });

  test.each([
    'donation.created',
    'donation.updated',
    'subscription.created',
    'subscription.updated',
    'subscription.cancelled',
    'subscription.payment_method_updated',
    'contact.created',
    'contact.updated',
    'form.created',
    'form.updated',
    'something.new',
  ])('acknowledges %s', async (type) => {
    const payload = JSON.stringify({ type });
    const ts = now();
    const res = await post(payload, {
      'X-Webhook-Signature': `sha256=${sign(payload, ts)}`,
      'X-Webhook-Timestamp': ts,
    });
    expect(res.status).toBe(200);
  });
});

describe('verifyCharityStackSignature', () => {
  const raw = Buffer.from('{"type":"contact.created"}');

  test('verifies a raw Buffer', () => {
    const ts = '1700000000';
    expect(
      verifyCharityStackSignature(raw, `sha256=${sign(raw, ts)}`, ts, SECRET).valid
    ).toBe(true);
  });

  test('uses the secret as UTF-8 bytes, not hex or base64', () => {
    const ts = '1700000000';
    const hexLooking = 'deadbeefdeadbeef';
    const sig = sign(raw, ts, hexLooking);
    expect(verifyCharityStackSignature(raw, sig, ts, hexLooking).valid).toBe(true);
  });

  test('applies tolerance relative to the supplied clock', () => {
    const ts = '1700000000';
    const sig = `sha256=${sign(raw, ts)}`;
    expect(verifyCharityStackSignature(raw, sig, ts, SECRET, 300, 1700000100).valid).toBe(true);
    expect(verifyCharityStackSignature(raw, sig, ts, SECRET, 300, 1700000400).valid).toBe(false);
  });

  test('returns an error for an empty signature', () => {
    expect(verifyCharityStackSignature(raw, '', '1700000000', SECRET).valid).toBe(false);
  });
});
