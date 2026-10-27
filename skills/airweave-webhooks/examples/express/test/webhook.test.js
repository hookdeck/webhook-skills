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

// prefix: 'svix' (Airweave as documented) or 'webhook' (Standard Webhooks names for the same values)
function send(payload, { msgId = `msg_${crypto.randomBytes(12).toString('hex')}`, timestamp = now(), signature, contentType = 'application/json', prefix = 'svix' } = {}) {
  return request(app)
    .post('/webhooks/airweave')
    .set('Content-Type', contentType)
    .set(`${prefix}-id`, msgId)
    .set(`${prefix}-timestamp`, timestamp)
    .set(`${prefix}-signature`, signature ?? sign(payload, msgId, timestamp))
    .send(payload);
}

// Every documented event is a flat body: `event_type`, the ids for its domain, and `timestamp`
function envelope(type) {
  return JSON.stringify({
    event_type: type,
    sync_id: '440e8400-e29b-41d4-a716-446655440099',
    sync_job_id: '550e8400-e29b-41d4-a716-446655440000',
    collection_id: '770e8400-e29b-41d4-a716-446655440002',
    collection_readable_id: 'finance-data-ab123',
    collection_name: 'Finance Data',
    source_connection_id: '660e8400-e29b-41d4-a716-446655440001',
    source_type: 'notion',
    timestamp: '2025-01-15T14:05:00Z',
  });
}

const EVENT_TYPES = [
  'sync.pending', 'sync.running', 'sync.completed', 'sync.failed', 'sync.cancelled',
  'source_connection.created', 'source_connection.auth_completed', 'source_connection.deleted',
  'collection.created', 'collection.updated', 'collection.deleted',
];

describe('Airweave webhook handler', () => {
  beforeEach(() => {
    process.env.AIRWEAVE_WEBHOOK_SECRET = TEST_SECRET;
  });

  test('covers the 11 documented events', () => {
    expect(new Set(EVENT_TYPES).size).toBe(11);
  });

  test.each(EVENT_TYPES)('handles %s', async (type) => {
    const res = await send(envelope(type));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type });
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(envelope('airweave.something.new'));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('airweave.something.new');
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(envelope('sync.completed'), { contentType: 'application/octet-stream' });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed the same way but sent with webhook-* headers', async () => {
    const res = await send(envelope('collection.created'), { prefix: 'webhook' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type: 'collection.created' });
  });

  test('rejects an invalid signature sent with webhook-* headers', async () => {
    const res = await send(envelope('collection.created'), { prefix: 'webhook', signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = envelope('source_connection.auth_completed');
    const msgId = 'msg_rotation';
    const timestamp = now();
    const signature = `v1,aW52YWxpZF9zaWduYXR1cmU= ${sign(payload, msgId, timestamp)}`;
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(200);
  });

  test('ignores signature versions other than v1', async () => {
    const payload = envelope('source_connection.auth_completed');
    const msgId = 'msg_v1a';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp).replace('v1,', 'v1a,');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects missing headers', async () => {
    const res = await request(app).post('/webhooks/airweave').set('Content-Type', 'application/json').send('{}');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required webhook headers');
  });

  test('rejects an invalid signature', async () => {
    const res = await send(envelope('sync.completed'), { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = envelope('sync.completed');
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign(envelope('sync.failed'), msgId, timestamp);
    const res = await send(envelope('sync.completed'), { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send(envelope('sync.completed'), { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.AIRWEAVE_WEBHOOK_SECRET;
    const res = await send(envelope('sync.completed'));
    expect(res.status).toBe(500);
  });

  test('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
