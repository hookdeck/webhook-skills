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

// prefix: 'svix' (Agntix) or 'webhook' (Standard Webhooks names for the same values)
function send(payload, { msgId = `msg_${crypto.randomBytes(12).toString('hex')}`, timestamp = now(), signature, contentType = 'application/json', prefix = 'svix' } = {}) {
  return request(app)
    .post('/webhooks/agntix')
    .set('Content-Type', contentType)
    .set(`${prefix}-id`, msgId)
    .set(`${prefix}-timestamp`, timestamp)
    .set(`${prefix}-signature`, signature ?? sign(payload, msgId, timestamp))
    .send(payload);
}

// Flat envelope (no `data`): `eventType` is the event name, `type` is the session kind (VOICE | CHAT)
function envelope(eventType, extra = {}) {
  return JSON.stringify({
    id: '4981804c-2658-4893-84ff-9c2fa90fb3c2',
    eventType,
    type: 'VOICE',
    platform: 'PHONE',
    direction: 'OUTBOUND',
    state: eventType === 'session.ended' ? 'CLOSED' : 'OPEN',
    agentId: '40235145-aa3d-443e-9d0c-841dd0716a2f',
    createdAt: '2026-04-08T05:00:01.130Z',
    metadata: { customerPhoneNumber: '+971501234567', sessionVariables: { crmContactId: 'CRM-7728' } },
    ...extra,
  });
}

const events = {
  'session.created': {},
  'session.ended': {
    lastActivityAt: '2026-04-08T05:00:09.000Z',
    endedAt: '2026-04-08T05:00:10.546Z',
    analysis: { summary: 'Customer confirmed delivery slot.', extractedData: { slotConfirmed: true } },
    recordingUrl: 'https://app.agntix.ai/en/logs-history?opened=4981804c-2658-4893-84ff-9c2fa90fb3c2',
  },
};

describe('Agntix webhook handler', () => {
  beforeEach(() => {
    process.env.AGNTIX_WEBHOOK_SECRET = TEST_SECRET;
  });

  test.each(Object.entries(events))('handles %s', async (eventType, extra) => {
    const res = await send(envelope(eventType, extra));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, eventType });
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(envelope('session.updated'));
    expect(res.status).toBe(200);
    expect(res.body.eventType).toBe('session.updated');
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(envelope('session.ended'), {
      contentType: 'application/octet-stream',
    });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed the same way but sent with webhook-* headers', async () => {
    const res = await send(envelope('session.ended'), { prefix: 'webhook' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, eventType: 'session.ended' });
  });

  test('rejects an invalid signature sent with webhook-* headers', async () => {
    const res = await send(envelope('session.ended'), { prefix: 'webhook', signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = envelope('session.created');
    const msgId = 'msg_rotation';
    const timestamp = now();
    const signature = `v1,aW52YWxpZF9zaWduYXR1cmU= ${sign(payload, msgId, timestamp)}`;
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(200);
  });

  test('rejects missing headers', async () => {
    const res = await request(app).post('/webhooks/agntix').set('Content-Type', 'application/json').send('{}');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required webhook headers');
  });

  test('rejects an unsigned delivery', async () => {
    const res = await request(app).post('/webhooks/agntix').set('Content-Type', 'application/json').send(envelope('session.created'));
    expect(res.status).toBe(400);
  });

  test('rejects an invalid signature', async () => {
    const res = await send(envelope('session.created'), { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = envelope('session.created');
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign(envelope('session.ended', { endedAt: '2026-04-08T05:00:10.546Z' }), msgId, timestamp);
    const res = await send(envelope('session.ended'), { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send(envelope('session.created'), { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.AGNTIX_WEBHOOK_SECRET;
    const res = await send(envelope('session.created'));
    expect(res.status).toBe(500);
  });

  test('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
