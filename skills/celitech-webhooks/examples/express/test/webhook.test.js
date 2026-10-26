import crypto from 'node:crypto';
import request from 'supertest';
import { app } from '../src/index.js';

// Svix secrets are 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Same algorithm Celitech (Svix) uses: base64(HMAC-SHA256(decoded secret, `${id}.${timestamp}.${body}`))
function sign(payload, msgId, timestamp, secret = TEST_SECRET) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${signature}`;
}

const now = () => Math.floor(Date.now() / 1000).toString();

function send(
  payload,
  { msgId = `msg_${crypto.randomBytes(12).toString('hex')}`, timestamp = now(), signature, prefix = 'svix', contentType = 'application/json' } = {}
) {
  return request(app)
    .post('/webhooks/celitech')
    .set('Content-Type', contentType)
    .set(`${prefix}-id`, msgId)
    .set(`${prefix}-timestamp`, timestamp)
    .set(`${prefix}-signature`, signature ?? sign(payload, msgId, timestamp))
    .send(payload);
}

describe('Celitech webhook handler', () => {
  beforeEach(() => {
    process.env.CELITECH_WEBHOOK_SECRET = TEST_SECRET;
  });

  test('handles consumption.threshold.reached', async () => {
    const payload = JSON.stringify({
      type: 'consumption.threshold.reached',
      purchaseId: '3f6c1c2e-0000-4000-8000-000000000001',
      dataLimitInGB: 5,
      dataUsageRemainingInGB: 1,
      actualPercentage: 80,
      notificationPercentage: 80,
    });
    const res = await send(payload);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type: 'consumption.threshold.reached' });
  });

  test.each(['esim.downloaded', 'esim.installed', 'esim.enabled', 'esim.disabled', 'esim.deleted'])(
    'handles %s',
    async (type) => {
      const res = await send(JSON.stringify({ type, iccid: '8910300000000000001' }));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, type });
    }
  );

  test('handles unknown event types gracefully', async () => {
    const res = await send(JSON.stringify({ type: 'esim.something-new' }));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('esim.something-new');
  });

  test('accepts a delivery signed the same way but sent with webhook-* headers', async () => {
    const res = await send(JSON.stringify({ type: 'esim.enabled', iccid: '1' }), { prefix: 'webhook' });
    expect(res.status).toBe(200);
  });

  test('verifies the exact bytes whatever the content type', async () => {
    const res = await send('{ "type":  "esim.deleted",\n "iccid": "1" }', { contentType: 'text/plain' });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('esim.deleted');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = JSON.stringify({ type: 'esim.enabled', iccid: '1' });
    const msgId = 'msg_rotation';
    const timestamp = now();
    const signature = `v1,aW52YWxpZF9zaWduYXR1cmU= ${sign(payload, msgId, timestamp)}`;
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(200);
  });

  test('rejects missing headers', async () => {
    const res = await request(app).post('/webhooks/celitech').set('Content-Type', 'application/json').send('{}');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required webhook headers');
  });

  test('rejects an invalid signature', async () => {
    const res = await send('{"type":"esim.enabled"}', { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = '{"type":"esim.enabled"}';
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign('{"type":"esim.enabled","iccid":"1"}', msgId, timestamp);
    const res = await send('{"type":"esim.enabled","iccid":"2"}', { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send('{"type":"esim.enabled"}', { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Timestamp too old');
  });

  test('fails closed (500) when the secret is not configured', async () => {
    delete process.env.CELITECH_WEBHOOK_SECRET;
    const res = await send('{"type":"esim.enabled"}');
    expect(res.status).toBe(500);
  });

  test('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
