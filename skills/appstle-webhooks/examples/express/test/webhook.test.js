import crypto from 'node:crypto';
import request from 'supertest';
import { app } from '../src/index.js';

// Appstle (Svix) secrets are 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Same algorithm Svix uses: base64(HMAC-SHA256(decoded secret, `${id}.${timestamp}.${body}`))
function sign(payload, msgId, timestamp, secret = TEST_SECRET) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${signature}`;
}

function now() {
  return Math.floor(Date.now() / 1000).toString();
}

function send(payload, { msgId = `msg_${crypto.randomBytes(12).toString('hex')}`, timestamp = now(), signature, contentType = 'application/json' } = {}) {
  return request(app)
    .post('/webhooks/appstle')
    .set('Content-Type', contentType)
    .set('svix-id', msgId)
    .set('svix-timestamp', timestamp)
    .set('svix-signature', signature ?? sign(payload, msgId, timestamp))
    .send(payload);
}

const subscription = { id: 'gid://shopify/SubscriptionContract/12345', status: 'ACTIVE', customer: { email: 'a@example.com' } };
const billingAttempt = { id: 98765, shop: 'example-store.myshopify.com', contractId: 12345, status: 'SUCCESS' };

describe('Appstle webhook handler', () => {
  beforeEach(() => {
    process.env.APPSTLE_WEBHOOK_SECRET = TEST_SECRET;
  });

  test.each([
    ['subscription.created', subscription],
    ['subscription.updated', subscription],
    ['subscription.activated', subscription],
    ['subscription.paused', subscription],
    ['subscription.cancelled', subscription],
    ['subscription.next-order-date-changed', subscription],
    ['subscription.billing-interval-changed', subscription],
    ['subscription.billing-success', billingAttempt],
    ['subscription.billing-failure', { ...billingAttempt, status: 'FAILURE' }],
    ['subscription.billing-skipped', { ...billingAttempt, status: 'SKIPPED' }],
    ['subscription.upcoming-order-notification', billingAttempt],
  ])('handles %s', async (type, data) => {
    const res = await send(JSON.stringify({ type, data }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type });
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(JSON.stringify({ type: 'subscription.something-new', data: {} }));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('subscription.something-new');
  });

  test('verifies bodies sent with any content type', async () => {
    const res = await send(JSON.stringify({ type: 'subscription.created', data: subscription }), {
      contentType: 'application/cloudevents+json',
    });
    expect(res.status).toBe(200);
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = JSON.stringify({ type: 'subscription.paused', data: subscription });
    const msgId = 'msg_rotation';
    const timestamp = now();
    const signature = `v1,aW52YWxpZF9zaWduYXR1cmU= ${sign(payload, msgId, timestamp)}`;
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(200);
  });

  test('rejects missing headers', async () => {
    const res = await request(app)
      .post('/webhooks/appstle')
      .set('Content-Type', 'application/json')
      .send('{}');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required webhook headers');
  });

  test('rejects an invalid signature', async () => {
    const res = await send('{"type":"subscription.created"}', { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = '{"type":"subscription.created"}';
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign('{"type":"subscription.created"}', msgId, timestamp);
    const res = await send('{"type":"subscription.cancelled"}', { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a stale timestamp (the SDK enforces a 5-minute window)', async () => {
    const payload = '{"type":"subscription.created"}';
    const msgId = 'msg_stale';
    const timestamp = (Math.floor(Date.now() / 1000) - 3600).toString();
    const res = await send(payload, { msgId, timestamp, signature: sign(payload, msgId, timestamp) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Timestamp too old');
  });

  test('rejects a valid signature over invalid JSON', async () => {
    const res = await send('not json');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSON');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.APPSTLE_WEBHOOK_SECRET;
    const res = await send('{}');
    expect(res.status).toBe(500);
  });
});
