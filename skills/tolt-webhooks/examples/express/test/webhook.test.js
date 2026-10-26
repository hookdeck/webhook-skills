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

// prefix: 'svix' (Tolt) or 'webhook' (Standard Webhooks names for the same values)
function send(payload, { msgId = `msg_${crypto.randomBytes(12).toString('hex')}`, timestamp = now(), signature, contentType = 'application/json', prefix = 'svix' } = {}) {
  return request(app)
    .post('/webhooks/tolt')
    .set('Content-Type', contentType)
    .set(`${prefix}-id`, msgId)
    .set(`${prefix}-timestamp`, timestamp)
    .set(`${prefix}-signature`, signature ?? sign(payload, msgId, timestamp))
    .send(payload);
}

const events = {
  'partner.created': { id: 'part_8fKq2LmZx7RtYw3nVbHc5dPj', email: 'sam@example.com', status: 'active' },
  'partner.updated': { id: 'part_8fKq2LmZx7RtYw3nVbHc5dPj', status: 'suspended' },
  'link.created': { id: 'link_3JkMn8QwLz5RtYb2NvHc7dPs', value: 'sam', partner_id: 'part_8fKq2LmZx7RtYw3nVbHc5dPj' },
  'link.updated': { id: 'link_3JkMn8QwLz5RtYb2NvHc7dPs', value: 'sam2' },
  'customer.created': { id: 'cus_4kLpQw9ZxRtYb3NvHc8LdFsJ', partner_id: 'part_8fKq2LmZx7RtYw3nVbHc5dPj', status: 'lead' },
  'customer.updated': { id: 'cus_4kLpQw9ZxRtYb3NvHc8LdFsJ', status: 'active' },
  'transaction.created': { id: 'txn_5MqRw9KxL2tZb8NvYc4HdFsJ', amount: '4900', currency: 'usd', status: 'paid' },
  'transaction.updated': { id: 'txn_5MqRw9KxL2tZb8NvYc4HdFsJ', status: 'refunded' },
  'commission.created': { id: 'comm_7XqLm2KwR9tZb4NvHc8YdFsJ', amount: '980', revenue: '4900', currency: 'usd', status: 'pending', partner_id: 'part_8fKq2LmZx7RtYw3nVbHc5dPj' },
  'commission.updated': { id: 'comm_7XqLm2KwR9tZb4NvHc8YdFsJ', status: 'approved' },
};

describe('Tolt webhook handler', () => {
  beforeEach(() => {
    process.env.TOLT_WEBHOOK_SECRET = TEST_SECRET;
  });

  test.each(Object.entries(events))('handles %s', async (type, data) => {
    const res = await send(JSON.stringify({ type, data, timestamp: '2026-08-24T14:25:41.000Z' }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type });
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(JSON.stringify({ type: 'tolt.something.new' }));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('tolt.something.new');
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(JSON.stringify({ type: 'commission.created', data: { id: 'comm_01J' } }), {
      contentType: 'application/octet-stream',
    });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed the same way but sent with webhook-* headers', async () => {
    const res = await send(JSON.stringify({ type: 'commission.created', data: { id: 'comm_01J' } }), { prefix: 'webhook' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type: 'commission.created' });
  });

  test('rejects an invalid signature sent with webhook-* headers', async () => {
    const res = await send('{"type":"commission.created"}', { prefix: 'webhook', signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = JSON.stringify({ type: 'transaction.created' });
    const msgId = 'msg_rotation';
    const timestamp = now();
    const signature = `v1,aW52YWxpZF9zaWduYXR1cmU= ${sign(payload, msgId, timestamp)}`;
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(200);
  });

  test('rejects missing headers', async () => {
    const res = await request(app).post('/webhooks/tolt').set('Content-Type', 'application/json').send('{}');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required webhook headers');
  });

  test('rejects a delivery with no signature headers', async () => {
    const res = await request(app).post('/webhooks/tolt').set('Content-Type', 'application/json').send('{"type":"customer.created"}');
    expect(res.status).toBe(400);
  });

  test('rejects an invalid signature', async () => {
    const res = await send('{"type":"transaction.created"}', { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = '{"type":"transaction.created"}';
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign('{"type":"commission.updated"}', msgId, timestamp);
    const res = await send('{"type":"commission.created"}', { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send('{"type":"transaction.created"}', { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.TOLT_WEBHOOK_SECRET;
    const res = await send('{"type":"transaction.created"}');
    expect(res.status).toBe(500);
  });

  test('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
