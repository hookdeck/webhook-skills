const request = require('supertest');
const crypto = require('crypto');

// Glean signing secrets are 'whsec_' + base64(key).
// base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';
process.env.GLEAN_SIGNING_SECRET = TEST_SECRET;
delete process.env.GLEAN_DELIVERY_BEARER;

const { app, server } = require('../src/index');

// base64(HMAC_SHA256(base64Decode(secret after whsec_), `${id}.${timestamp}.${payload}`))
function sign(payload, secret, timestamp, msgId) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${sig}`;
}

const event = {
  version: '1',
  trigger_id: 'spec-7d2f1a8b3c9e0546',
  datasource: 'GOOGLECALENDAR',
  doc_type: 'event',
  event_type: 'CONTENT_SCHEDULE',
  title: 'Platform weekly',
  view_url: 'https://www.google.com/calendar/event?eid=abc',
  event_time: '2026-08-25T18:30:00Z',
  time_offset_seconds: 1800,
};

function send({ body = JSON.stringify(event), contentType = 'application/json', ts, id, signature, extra = {} } = {}) {
  const timestamp = ts ?? Math.floor(Date.now() / 1000).toString();
  const msgId = id ?? 'msg_' + crypto.randomBytes(8).toString('hex');
  const sig = signature ?? sign(body, TEST_SECRET, timestamp, msgId);
  return request(app)
    .post('/webhooks/glean')
    .set('Content-Type', contentType)
    .set({ 'webhook-id': msgId, 'webhook-timestamp': timestamp, 'webhook-signature': sig, ...extra })
    .send(body);
}

describe('Glean Webhook Handler', () => {
  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  test('processes a valid CONTENT_SCHEDULE delivery', async () => {
    const res = await send();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, event_type: 'CONTENT_SCHEDULE' });
  });

  test('verifies regardless of content type (express.raw */*)', async () => {
    const res = await send({ contentType: 'text/plain' });
    expect(res.status).toBe(200);
  });

  test('accepts several space-delimited signatures', async () => {
    const body = JSON.stringify(event);
    const ts = Math.floor(Date.now() / 1000).toString();
    const id = 'msg_multi';
    const multi = `v1,aW52YWxpZA== ${sign(body, TEST_SECRET, ts, id)}`;
    const res = await send({ body, ts, id, signature: multi });
    expect(res.status).toBe(200);
  });

  test('handles unknown event types', async () => {
    const res = await send({ body: JSON.stringify({ ...event, event_type: 'SOMETHING_ELSE' }) });
    expect(res.status).toBe(200);
    expect(res.body.event_type).toBe('SOMETHING_ELSE');
  });

  test('rejects an invalid signature', async () => {
    const res = await send({ signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const ts = Math.floor(Date.now() / 1000).toString();
    const signature = sign(JSON.stringify(event), TEST_SECRET, ts, 'msg_t');
    const res = await send({ body: JSON.stringify({ ...event, title: 'x' }), ts, id: 'msg_t', signature });
    expect(res.status).toBe(400);
  });

  test('rejects a timestamp older than 5 minutes (library window)', async () => {
    const res = await send({ ts: (Math.floor(Date.now() / 1000) - 600).toString() });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Timestamp too old');
  });

  test('rejects missing headers', async () => {
    const res = await request(app).post('/webhooks/glean').set('Content-Type', 'application/json').send('{}');
    expect(res.status).toBe(400);
  });

  test('rejects a wrong bearer credential when one is configured', async () => {
    process.env.GLEAN_DELIVERY_BEARER = 'delivery-secret';
    try {
      const bad = await send({ extra: { Authorization: 'Bearer nope' } });
      expect(bad.status).toBe(401);
      const good = await send({ extra: { Authorization: 'Bearer delivery-secret' } });
      expect(good.status).toBe(200);
    } finally {
      delete process.env.GLEAN_DELIVERY_BEARER;
    }
  });
});
