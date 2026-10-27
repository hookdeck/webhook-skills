import crypto from 'node:crypto';
import request from 'supertest';
import { app } from '../src/index.js';

// Svix-format secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Svix algorithm: base64(HMAC-SHA256(decoded secret, `${id}.${timestamp}.${body}`))
function sign(payload, msgId, timestamp, secret = TEST_SECRET) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${signature}`;
}

function now() {
  return Math.floor(Date.now() / 1000).toString();
}

function send(payload, { msgId = `msg_${crypto.randomBytes(12).toString('hex')}`, timestamp = now(), signature, contentType = 'application/json', prefix = 'svix' } = {}) {
  return request(app)
    .post('/webhooks/dots')
    .set('Content-Type', contentType)
    .set(`${prefix}-id`, msgId)
    .set(`${prefix}-timestamp`, timestamp)
    .set(`${prefix}-signature`, signature ?? sign(payload, msgId, timestamp))
    .send(payload);
}

// Example payloads from Dots' event catalog (ids only)
const events = {
  'payment_intent.updated': { payment_intent_id: 'payment-intent-id' },
  'payment_method.updated': { payment_method_id: 'payment-method-id' },
  'flow.updated': { flow_id: 'flow-id' },
  'dispute.updated': { dispute_id: 'dispute-id' },
  'payout_request.updated': { payout_request_id: 'payout-request-id' },
  'organization.updated': { organization_id: 'organization-id' },
  'app.updated': { app_id: 'app-id' },
  'transfer.updated': { transfer_id: 'transfer-id' },
  'payout_link.updated': { payout_link_id: 'payout-link-id' },
  'user.updated': { user_id: 'user-id' },
  'user.onboarded': { ach_account_id: 'ach-account-id', flow_id: 'flow-id', transfer_id: 'transfer-id', user_id: 'user-id' },
  'user.onboarding_revoked': { ach_account_id: 'ach-account-id', flow_id: 'flow-id', reason: 'Insufficient funds', transfer_id: 'transfer-id', user_id: 'user-id' },
};

describe('Dots webhook handler', () => {
  beforeEach(() => {
    process.env.DOTS_WEBHOOK_SECRET = TEST_SECRET;
  });

  test.each(Object.entries(events))('handles %s', async (type, data) => {
    const res = await send(JSON.stringify({ event: type, ...data }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type });
  });

  test('handles an app-originated event with api_app_id', async () => {
    const res = await send(JSON.stringify({ event: 'flow.updated', flow_id: 'flow-id', api_app_id: 'app-id' }));
    expect(res.status).toBe(200);
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(JSON.stringify({ event: 'widget.updated' }));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('widget.updated');
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(JSON.stringify({ event: 'user.updated', user_id: 'user-id' }), {
      contentType: 'application/octet-stream',
    });
    expect(res.status).toBe(200);
  });

  test('accepts the same delivery sent with webhook-* headers', async () => {
    const res = await send(JSON.stringify({ event: 'transfer.updated', transfer_id: 'transfer-id' }), { prefix: 'webhook' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type: 'transfer.updated' });
  });

  test('rejects an invalid signature sent with webhook-* headers', async () => {
    const res = await send('{"event":"transfer.updated"}', { prefix: 'webhook', signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('does not mix svix-id with webhook-* timestamp and signature', async () => {
    const payload = '{"event":"transfer.updated"}';
    const timestamp = now();
    const res = await request(app)
      .post('/webhooks/dots')
      .set('Content-Type', 'application/json')
      .set('svix-id', 'msg_mixed')
      .set('webhook-timestamp', timestamp)
      .set('webhook-signature', sign(payload, 'msg_mixed', timestamp))
      .send(payload);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required webhook headers');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = JSON.stringify({ event: 'flow.updated', flow_id: 'flow-id' });
    const msgId = 'msg_rotation';
    const timestamp = now();
    const signature = `v1,aW52YWxpZF9zaWduYXR1cmU= ${sign(payload, msgId, timestamp)}`;
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(200);
  });

  test('rejects missing headers', async () => {
    const res = await request(app).post('/webhooks/dots').set('Content-Type', 'application/json').send('{}');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required webhook headers');
  });

  test('rejects an invalid signature', async () => {
    const res = await send('{"event":"flow.updated"}', { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a malformed signature entry', async () => {
    const res = await send('{"event":"flow.updated"}', { signature: 'not-a-signature' });
    expect(res.status).toBe(400);
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = '{"event":"flow.updated"}';
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign('{"event":"transfer.updated","transfer_id":"a"}', msgId, timestamp);
    const res = await send('{"event":"transfer.updated","transfer_id":"b"}', { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send('{"event":"flow.updated"}', { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.DOTS_WEBHOOK_SECRET;
    const res = await send('{"event":"flow.updated"}');
    expect(res.status).toBe(500);
  });

  test('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
