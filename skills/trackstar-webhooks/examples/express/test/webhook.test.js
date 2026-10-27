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

// prefix: 'svix' (Trackstar) or 'webhook' (Standard Webhooks names for the same values)
function send(payload, { msgId = `msg_${crypto.randomBytes(12).toString('hex')}`, timestamp = now(), signature, contentType = 'application/json', prefix = 'svix' } = {}) {
  return request(app)
    .post('/webhooks/trackstar')
    .set('Content-Type', contentType)
    .set(`${prefix}-id`, msgId)
    .set(`${prefix}-timestamp`, timestamp)
    .set(`${prefix}-signature`, signature ?? sign(payload, msgId, timestamp))
    .send(payload);
}

const events = {
  'connection.created': { connection_id: 'conn_01', integration_name: 'ShipBob', data: { id: 'conn_01' } },
  'connection.deleted': { connection_id: 'conn_01', data: { id: 'conn_01' } },
  'connection.historical-sync-completed': { connection_id: 'conn_01', data: { resource: 'orders' } },
  'connection.sync-job-stuck': { connection_id: 'conn_01', data: {} },
  'connection-error.created': { connection_id: 'conn_01', data: { id: 'err_01' } },
  'install.failed': { integration_name: 'ShipBob', data: {} },
  'order.created': { connection_id: 'conn_01', data: { id: 'ord_01', status: 'open' } },
  'order.updated': { connection_id: 'conn_01', data: { id: 'ord_01', status: 'shipped' }, previous_attributes: { status: 'open' } },
  'order.shipment.created': { connection_id: 'conn_01', data: { id: 'shp_01' } },
  'inventory.updated': { connection_id: 'conn_01', data: { id: 'inv_01' }, previous_attributes: { 'locations.0.onhand': 3 } },
  'inbound-shipment.updated': { connection_id: 'conn_01', data: { id: 'ibs_01', status: 'received' }, previous_attributes: { status: 'open' } },
};

describe('Trackstar webhook handler', () => {
  beforeEach(() => {
    process.env.TRACKSTAR_WEBHOOK_SECRET = TEST_SECRET;
  });

  test.each(Object.entries(events))('handles %s', async (type, data) => {
    const res = await send(JSON.stringify({ event_type: type, ...data }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type });
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(JSON.stringify({ event_type: 'inbound-shipment.receipt.created' }));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('inbound-shipment.receipt.created');
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(JSON.stringify({ event_type: 'order.created', data: { id: 'ord_01' } }), {
      contentType: 'application/octet-stream',
    });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed the same way but sent with webhook-* headers', async () => {
    const res = await send(JSON.stringify({ event_type: 'order.created', data: { id: 'ord_01' } }), { prefix: 'webhook' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type: 'order.created' });
  });

  test('rejects an invalid signature sent with webhook-* headers', async () => {
    const res = await send('{"event_type":"order.created"}', { prefix: 'webhook', signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = JSON.stringify({ event_type: 'order.updated' });
    const msgId = 'msg_rotation';
    const timestamp = now();
    const signature = `v1,aW52YWxpZF9zaWduYXR1cmU= ${sign(payload, msgId, timestamp)}`;
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(200);
  });

  test('rejects missing headers', async () => {
    const res = await request(app).post('/webhooks/trackstar').set('Content-Type', 'application/json').send('{}');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required webhook headers');
  });

  test('rejects an unsigned delivery', async () => {
    const res = await request(app).post('/webhooks/trackstar').set('Content-Type', 'application/json').send('{"event_type":"order.created"}');
    expect(res.status).toBe(400);
  });

  test('rejects an invalid signature', async () => {
    const res = await send('{"event_type":"order.updated"}', { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = '{"event_type":"order.updated"}';
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign('{"event_type":"order.shipment.created"}', msgId, timestamp);
    const res = await send('{"event_type":"order.created"}', { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send('{"event_type":"order.updated"}', { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.TRACKSTAR_WEBHOOK_SECRET;
    const res = await send('{"event_type":"order.updated"}');
    expect(res.status).toBe(500);
  });

  test('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
