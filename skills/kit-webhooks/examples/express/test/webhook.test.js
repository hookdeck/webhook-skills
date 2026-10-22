const crypto = require('crypto');
const request = require('supertest');

// Kit secrets start with whsec_ but are used WHOLE as UTF-8 key bytes (no base64 decoding)
const SECRET = 'whsec_9f8a1c2d3e4f5a6b7c8d9e0f1a2b3c4d';
process.env.KIT_WEBHOOK_SECRET = SECRET;

const { app, verifyKitWebhook } = require('../src/index');

function v1(body, secret = SECRET, t) {
  return crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
}

function sign(body, secret = SECRET, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${v1(body, secret, t)}`;
}

const event = (type, data = {}) => ({
  id: '9c2e1f3a-6b7d-4e8f-a1b2-c3d4e5f60718',
  type,
  created: '2026-07-29T14:32:10Z',
  data,
});

const subscriber = {
  id: 987654,
  first_name: 'Ada',
  email_address: 'ada@example.com',
  state: 'active',
  created_at: '2026-07-29T14:32:10Z',
  fields: {},
};

const delivery = (...events) => JSON.stringify({ delivery_id: 123456, events });

const post = (body, header, contentType = 'application/json') => {
  const r = request(app).post('/webhooks/kit').set('Content-Type', contentType);
  if (header) r.set('X-Kit-Signature', header);
  return r.send(body);
};

describe('verifyKitWebhook', () => {
  const body = delivery(event('subscriber.created', { subscriber }));

  test('accepts a valid signature', () => {
    expect(verifyKitWebhook(body, sign(body), SECRET)).toBe(true);
  });

  test('uses the whole whsec_ secret, not a stripped or base64-decoded one', () => {
    const stripped = SECRET.slice('whsec_'.length);
    const decoded = Buffer.from(stripped, 'base64');
    expect(verifyKitWebhook(body, sign(body, stripped), SECRET)).toBe(false);
    const t = Math.floor(Date.now() / 1000);
    const viaDecoded = crypto.createHmac('sha256', decoded).update(`${t}.${body}`).digest('hex');
    expect(verifyKitWebhook(body, `t=${t},v1=${viaDecoded}`, SECRET)).toBe(false);
  });

  test('rejects wrong secret', () => {
    expect(verifyKitWebhook(body, sign(body, 'whsec_other'), SECRET)).toBe(false);
  });

  test('rejects tampered body', () => {
    expect(verifyKitWebhook(body + ' ', sign(body), SECRET)).toBe(false);
  });

  test('rejects a tampered timestamp', () => {
    const t = Math.floor(Date.now() / 1000);
    expect(verifyKitWebhook(body, `t=${t + 1},v1=${v1(body, SECRET, t)}`, SECRET)).toBe(false);
  });

  test('accepts an old timestamp by default (retries keep the original t)', () => {
    delete process.env.KIT_TIMESTAMP_TOLERANCE_SECONDS;
    const old = Math.floor(Date.now() / 1000) - 86400;
    expect(verifyKitWebhook(body, sign(body, SECRET, old), SECRET)).toBe(true);
  });

  test('rejects an old timestamp with an explicit tolerance', () => {
    const old = Math.floor(Date.now() / 1000) - 600;
    expect(verifyKitWebhook(body, sign(body, SECRET, old), SECRET, 300)).toBe(false);
  });

  test('rejects an old timestamp when KIT_TIMESTAMP_TOLERANCE_SECONDS is set', () => {
    process.env.KIT_TIMESTAMP_TOLERANCE_SECONDS = '300';
    try {
      const old = Math.floor(Date.now() / 1000) - 600;
      expect(verifyKitWebhook(body, sign(body, SECRET, old), SECRET)).toBe(false);
    } finally {
      delete process.env.KIT_TIMESTAMP_TOLERANCE_SECONDS;
    }
  });

  test('treats a non-numeric KIT_TIMESTAMP_TOLERANCE_SECONDS as 0 (check off)', () => {
    process.env.KIT_TIMESTAMP_TOLERANCE_SECONDS = 'five minutes';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const old = Math.floor(Date.now() / 1000) - 600;
      expect(verifyKitWebhook(body, sign(body, SECRET, old), SECRET)).toBe(true);
    } finally {
      delete process.env.KIT_TIMESTAMP_TOLERANCE_SECONDS;
      warn.mockRestore();
    }
  });

  test('stale timestamp passes with a wider tolerance', () => {
    const old = Math.floor(Date.now() / 1000) - 600;
    expect(verifyKitWebhook(body, sign(body, SECRET, old), SECRET, 3600)).toBe(true);
  });

  test('rejects malformed headers', () => {
    expect(verifyKitWebhook(body, 'garbage', SECRET)).toBe(false);
    expect(verifyKitWebhook(body, 't=abc,v1=00', SECRET)).toBe(false);
    expect(verifyKitWebhook(body, `t=${Math.floor(Date.now() / 1000)}`, SECRET)).toBe(false);
    expect(verifyKitWebhook(body, undefined, SECRET)).toBe(false);
  });

  test('accepts when any v1 signature matches (secret rotation)', () => {
    const t = Math.floor(Date.now() / 1000);
    const oldSecret = 'whsec_previous_secret';
    // New secret first, previous secret second, as Kit sends during the overlap window
    expect(
      verifyKitWebhook(body, `t=${t},v1=${v1(body, SECRET, t)},v1=${v1(body, oldSecret, t)}`, SECRET)
    ).toBe(true);
    // Receiver still on the previous secret
    expect(
      verifyKitWebhook(body, `t=${t},v1=${v1(body, SECRET, t)},v1=${v1(body, oldSecret, t)}`, oldSecret)
    ).toBe(true);
    expect(verifyKitWebhook(body, `${sign(body)},v1=deadbeef`, SECRET)).toBe(true);
  });

  test('tolerates spaces after commas in the header', () => {
    const t = Math.floor(Date.now() / 1000);
    expect(verifyKitWebhook(body, `t=${t}, v1=${v1(body, SECRET, t)}`, SECRET)).toBe(true);
  });
});

describe('POST /webhooks/kit', () => {
  test('returns 200 for a valid delivery with several event types', async () => {
    for (const [type, extra] of [
      ['subscriber.created', {}],
      ['subscriber.activated', {}],
      ['subscriber.unsubscribed', {}],
      ['subscriber.bounced', {}],
      ['subscriber.complained', {}],
      ['subscriber.subscribed_to_form', { form: { id: 55, name: 'Newsletter signup' } }],
      ['subscriber.tag_added', { tag: { id: 42, name: 'customer' } }],
      ['subscriber.tag_removed', { tag: { id: 42, name: 'customer' } }],
      ['broadcast.sent', {}],
    ]) {
      const body = delivery(event(type, { subscriber, ...extra }));
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
    }
  });

  test('returns 200 for a batched delivery', async () => {
    const body = delivery(
      event('subscriber.created', { subscriber }),
      { ...event('subscriber.created', { subscriber }), id: 'b1' }
    );
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
  });

  test('verifies any content type (raw body)', async () => {
    const body = delivery(event('subscriber.created', { subscriber }));
    const res = await post(body, sign(body), 'application/vnd.kit+json');
    expect(res.status).toBe(200);
  });

  test('returns 400 for an invalid signature', async () => {
    const body = delivery(event('subscriber.created', { subscriber }));
    const res = await post(body, sign(body, 'whsec_wrong'));
    expect(res.status).toBe(400);
  });

  test('returns 400 for a missing header', async () => {
    const res = await post(delivery(event('subscriber.created', { subscriber })));
    expect(res.status).toBe(400);
  });

  test('returns 400 for a validly signed body without an events array', async () => {
    const body = JSON.stringify({ type: 'subscriber.created' });
    const res = await post(body, sign(body));
    expect(res.status).toBe(400);
  });

  test('returns 400 for validly signed invalid JSON', async () => {
    const body = 'not json';
    const res = await post(body, sign(body));
    expect(res.status).toBe(400);
  });

  test('health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
