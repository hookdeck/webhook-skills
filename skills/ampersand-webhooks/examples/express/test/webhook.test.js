import { jest } from '@jest/globals';
import crypto from 'node:crypto';
import request from 'supertest';
import { app } from '../src/index.js';

// Svix-style secret: 'whsec_' + base64(key). base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// base64(HMAC_SHA256(base64Decode(secret after whsec_), `${id}.${timestamp}.${body}`))
function sign(payload, timestamp, msgId, secret = TEST_SECRET) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${sig}`;
}

function signedHeaders(payload, { timestamp, msgId, signature } = {}) {
  const ts = timestamp ?? Math.floor(Date.now() / 1000).toString();
  const id = msgId ?? 'msg_' + crypto.randomBytes(12).toString('hex');
  return {
    'svix-id': id,
    'svix-timestamp': ts,
    'svix-signature': signature ?? sign(payload, ts, id),
  };
}

function post(payload, headers, contentType = 'application/json') {
  return request(app).post('/webhooks/ampersand').set('Content-Type', contentType).set(headers).send(payload);
}

const NOTIFICATION_TYPES = [
  'installation.created', 'installation.updated', 'installation.deleted',
  'connection.created', 'connection.refreshed', 'connection.updated', 'connection.deleted', 'connection.error',
  'read.backfill.done', 'read.backfill.error', 'read.schedule.paused', 'read.triggered.done', 'read.triggered.error',
  'write.async.done',
  'subscribe.create.success', 'subscribe.update.success', 'subscribe.delete.success',
  'subscribe.create.error', 'subscribe.update.error', 'subscribe.delete.error',
  'destination.webhook.disabled', 'destination.delivery.error',
];

describe('Ampersand webhook handler', () => {
  let logSpy;
  let errorSpy;
  beforeAll(() => {
    process.env.AMPERSAND_WEBHOOK_SECRET = TEST_SECRET;
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterAll(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  test('accepts a valid notification', async () => {
    const payload = JSON.stringify({
      notificationType: 'installation.created',
      data: { installationId: 'inst_1', groupRef: 'acme', provider: 'salesforce' },
    });
    const res = await post(payload, signedHeaders(payload));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type: 'installation.created' });
  });

  test.each(NOTIFICATION_TYPES)('handles notification %s', async (type) => {
    const payload = JSON.stringify({ notificationType: type, data: { installationId: 'inst_1', connectionId: 'conn_1' } });
    const res = await post(payload, signedHeaders(payload));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe(type);
  });

  test('accepts an unknown notification type', async () => {
    const payload = JSON.stringify({ notificationType: 'something.new', data: {} });
    const res = await post(payload, signedHeaders(payload));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('something.new');
  });

  test('treats a body without notificationType as a read result (inline)', async () => {
    const payload = JSON.stringify({
      action: 'read', groupRef: 'acme', objectName: 'Contact', readType: 'scheduled',
      resultInfo: { type: 'inline', numRecords: 1 },
      result: [{ fields: { id: '001' }, mappedFields: {}, raw: { id: '001' } }],
    });
    const res = await post(payload, signedHeaders(payload));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type: 'read' });
  });

  test('treats a URL read result as a read result', async () => {
    const payload = JSON.stringify({
      action: 'read', groupRef: 'acme', objectName: 'Contact',
      resultInfo: { type: 'url', downloadUrl: 'https://example.com/r.json', numRecords: 1 },
    });
    const res = await post(payload, signedHeaders(payload));
    expect(res.status).toBe(200);
  });

  test('handles subscribe results', async () => {
    const payload = JSON.stringify({
      action: 'subscribe', groupRef: 'acme', objectName: 'company',
      resultInfo: { type: 'inline', numRecords: 1 },
      result: [{ fields: { id: '001' }, subscribeEventType: 'update', providerEventType: 'UPDATE', raw: {} }],
    });
    const res = await post(payload, signedHeaders(payload));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('subscribe');
  });

  test('verifies any content type', async () => {
    const payload = JSON.stringify({ notificationType: 'connection.created', data: {} });
    const res = await post(payload, signedHeaders(payload), 'text/plain');
    expect(res.status).toBe(200);
  });

  test('accepts rotation: several v1 entries, one valid', async () => {
    const payload = JSON.stringify({ notificationType: 'connection.error', data: { errors: ['x'] } });
    const h = signedHeaders(payload);
    h['svix-signature'] = `v1,aW52YWxpZF9zaWduYXR1cmU= ${h['svix-signature']}`;
    const res = await post(payload, h);
    expect(res.status).toBe(200);
  });

  test('rejects missing headers', async () => {
    const res = await post('{"notificationType":"installation.created"}', {});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Missing required');
  });

  test('rejects an invalid signature', async () => {
    const payload = JSON.stringify({ notificationType: 'installation.created', data: {} });
    const res = await post(payload, signedHeaders(payload, { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a signature made with another secret', async () => {
    const payload = JSON.stringify({ notificationType: 'installation.created', data: {} });
    const other = 'whsec_' + Buffer.from('another_secret').toString('base64');
    const ts = Math.floor(Date.now() / 1000).toString();
    const res = await post(payload, signedHeaders(payload, { timestamp: ts, msgId: 'msg_1', signature: sign(payload, ts, 'msg_1', other) }));
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const payload = JSON.stringify({ notificationType: 'installation.created', data: {} });
    const headers = signedHeaders(payload);
    const res = await post(payload.replace('created', 'deleted'), headers);
    expect(res.status).toBe(400);
  });

  test('rejects a timestamp outside the 5-minute window', async () => {
    const payload = JSON.stringify({ notificationType: 'installation.created', data: {} });
    const old = (Math.floor(Date.now() / 1000) - 600).toString();
    const res = await post(payload, signedHeaders(payload, { timestamp: old }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Timestamp too old');
  });

  test('rejects a validly signed body that is not JSON', async () => {
    const payload = 'not json';
    const res = await post(payload, signedHeaders(payload), 'text/plain');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSON');
  });

  test('returns 500 when the secret is not configured', async () => {
    const saved = process.env.AMPERSAND_WEBHOOK_SECRET;
    delete process.env.AMPERSAND_WEBHOOK_SECRET;
    const payload = '{}';
    const res = await post(payload, signedHeaders(payload));
    process.env.AMPERSAND_WEBHOOK_SECRET = saved;
    expect(res.status).toBe(500);
  });
});
