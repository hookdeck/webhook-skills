import request from 'supertest';
import crypto from 'node:crypto';

// Svix-style secret: 'whsec_' + base64(key). base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';
process.env.WETRAVEL_WEBHOOK_SECRET = TEST_SECRET;

// Dynamic import so the env var above is set before the app module loads.
const { app } = await import('../src/index.js');

const EVENT_TYPES = [
  'booking.created',
  'booking.updated',
  'payment.created',
  'payment.updated',
  'transaction.created',
  'transaction.updated',
  'trip.published',
  'lead.created',
  'lead.updated',
];

// Sign the way Svix does:
// base64(HMAC_SHA256(base64Decode(secret after whsec_), `${id}.${timestamp}.${payload}`))
function sign(payload, timestamp, msgId, secret = TEST_SECRET) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${sig}`;
}

function signedRequest(payload, { prefix = 'svix', timestamp, signature } = {}) {
  const ts = timestamp || Math.floor(Date.now() / 1000).toString();
  const msgId = 'msg_' + crypto.randomBytes(12).toString('hex');
  return request(app)
    .post('/webhooks/wetravel')
    .set('Content-Type', 'application/json')
    .set(`${prefix}-id`, msgId)
    .set(`${prefix}-timestamp`, ts)
    .set(`${prefix}-signature`, signature || sign(payload, ts, msgId))
    .send(payload);
}

const body = (type) => JSON.stringify({ type, data: { id: 12345 } });

describe('WeTravel Webhook Handler', () => {
  test('accepts a valid svix-* signed webhook', async () => {
    const res = await signedRequest(body('booking.created'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type: 'booking.created' });
  });

  test('accepts webhook-* header aliases', async () => {
    const res = await signedRequest(body('payment.created'), { prefix: 'webhook' });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('payment.created');
  });

  test('accepts when any one of multiple signatures matches (secret rotation)', async () => {
    const payload = body('booking.updated');
    const ts = Math.floor(Date.now() / 1000).toString();
    const msgId = 'msg_rotation';
    const res = await request(app)
      .post('/webhooks/wetravel')
      .set('Content-Type', 'application/json')
      .set('svix-id', msgId)
      .set('svix-timestamp', ts)
      .set('svix-signature', `v1,aW52YWxpZF9zaWduYXR1cmU= ${sign(payload, ts, msgId)}`)
      .send(payload);
    expect(res.status).toBe(200);
  });

  test('rejects missing headers', async () => {
    const res = await request(app)
      .post('/webhooks/wetravel')
      .set('Content-Type', 'application/json')
      .send(body('booking.created'));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required webhook headers');
  });

  test('rejects an invalid signature', async () => {
    const res = await signedRequest(body('booking.created'), { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a signature made with the wrong secret', async () => {
    const payload = body('booking.created');
    const ts = Math.floor(Date.now() / 1000).toString();
    const wrong = sign(payload, ts, 'msg_x', 'whsec_' + Buffer.from('another_key').toString('base64'));
    const res = await request(app)
      .post('/webhooks/wetravel')
      .set('Content-Type', 'application/json')
      .set('svix-id', 'msg_x')
      .set('svix-timestamp', ts)
      .set('svix-signature', wrong)
      .send(payload);
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const ts = Math.floor(Date.now() / 1000).toString();
    const signature = sign(body('booking.created'), ts, 'msg_t');
    const res = await request(app)
      .post('/webhooks/wetravel')
      .set('Content-Type', 'application/json')
      .set('svix-id', 'msg_t')
      .set('svix-timestamp', ts)
      .set('svix-signature', signature)
      .send(body('booking.updated'));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects an old timestamp', async () => {
    const old = (Math.floor(Date.now() / 1000) - 600).toString();
    const res = await signedRequest(body('booking.created'), { timestamp: old });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Timestamp too old');
  });

  test.each(EVENT_TYPES)('handles %s', async (type) => {
    const res = await signedRequest(body(type));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe(type);
  });

  test('acknowledges unknown event types', async () => {
    const res = await signedRequest(body('something.new'));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('something.new');
  });

  test('health check endpoint works', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
