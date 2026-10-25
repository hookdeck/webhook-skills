import crypto from 'node:crypto';
import request from 'supertest';
import { app, getEventName } from '../src/index.js';

// SafeBase (Svix) secrets are 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
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
    .post('/webhooks/safebase')
    .set('Content-Type', contentType)
    .set('svix-id', msgId)
    .set('svix-timestamp', timestamp)
    .set('svix-signature', signature ?? sign(payload, msgId, timestamp))
    .send(payload);
}

describe('SafeBase webhook handler', () => {
  beforeEach(() => {
    process.env.SAFEBASE_WEBHOOK_SECRET = TEST_SECRET;
  });

  test.each([
    'accessRequest.requested',
    'accessRequest.blocked',
    'accessRequest.autoApprove.requireManual',
    'accounts.created',
    'accounts.nda.completed',
    'portal.viewed',
    'portal.file.downloaded',
    'questionnaire.completed',
    'knowledgebase.entry.created',
  ])('handles %s', async (type) => {
    const res = await send(JSON.stringify({ eventType: type, data: { id: '1' } }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type });
  });

  test('accepts a body without an event name (test event)', async () => {
    const res = await send(JSON.stringify({ message: 'test' }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type: null });
  });

  test('verifies the raw body for any content type', async () => {
    const res = await send(JSON.stringify({ type: 'portal.viewed' }), { contentType: 'application/cloudevents+json' });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('portal.viewed');
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(JSON.stringify({ eventType: 'something.new' }));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('something.new');
  });

  test('getEventName reads eventType, event_type, type or event', () => {
    expect(getEventName({ eventType: 'a' })).toBe('a');
    expect(getEventName({ event_type: 'b' })).toBe('b');
    expect(getEventName({ type: 'c' })).toBe('c');
    expect(getEventName({ event: 'd' })).toBe('d');
    expect(getEventName({ event: { nested: true } })).toBeNull();
    expect(getEventName(null)).toBeNull();
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = JSON.stringify({ eventType: 'portal.viewed' });
    const msgId = 'msg_rotation';
    const timestamp = now();
    const signature = `v1,aW52YWxpZF9zaWduYXR1cmU= ${sign(payload, msgId, timestamp)}`;
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed with webhook-* headers instead of svix-*', async () => {
    const payload = JSON.stringify({ eventType: 'portal.viewed' });
    const msgId = 'msg_webhook_prefix';
    const timestamp = now();
    const res = await request(app)
      .post('/webhooks/safebase')
      .set('Content-Type', 'application/json')
      .set('webhook-id', msgId)
      .set('webhook-timestamp', timestamp)
      .set('webhook-signature', sign(payload, msgId, timestamp))
      .send(payload);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type: 'portal.viewed' });
  });

  test('rejects missing headers', async () => {
    const res = await request(app)
      .post('/webhooks/safebase')
      .set('Content-Type', 'application/json')
      .send('{}');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required webhook headers');
  });

  test('rejects an invalid signature', async () => {
    const res = await send('{"eventType":"portal.viewed"}', { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = '{"eventType":"portal.viewed"}';
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign('{"eventType":"portal.viewed"}', msgId, timestamp);
    const res = await send('{"eventType":"portal.file.downloaded"}', { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send('{"eventType":"portal.viewed"}', { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.SAFEBASE_WEBHOOK_SECRET;
    const res = await send('{"eventType":"portal.viewed"}');
    expect(res.status).toBe(500);
  });

  test('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
