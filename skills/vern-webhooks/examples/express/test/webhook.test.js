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

// prefix: 'svix' (Vern via Svix) or 'webhook' (Standard Webhooks names for the same values)
function send(payload, { msgId = `msg_${crypto.randomBytes(12).toString('hex')}`, timestamp = now(), signature, contentType = 'application/json', prefix = 'svix' } = {}) {
  return request(app)
    .post('/webhooks/vern')
    .set('Content-Type', contentType)
    .set(`${prefix}-id`, msgId)
    .set(`${prefix}-timestamp`, timestamp)
    .set(`${prefix}-signature`, signature ?? sign(payload, msgId, timestamp))
    .send(payload);
}

const batch = { id: 'batch_a1b2c3d4e5f6', index: 0, total: 3, size: 2, timestamp: '2026-05-12T12:00:00.000Z' };

// Flat payload (version 1.0), as in Vern's docs
const flat = {
  version: '1.0',
  workbook_id: 'wb_abc123',
  external_id: 'your-external-id',
  batch,
  sheets: [
    {
      id: 'sheet_001',
      name: 'Contacts',
      row_count: 2,
      start_row_index: 0,
      end_row_index: 1,
      data: [
        { 'First Name': 'Jane', 'Last Name': 'Doe', Email: 'jane@example.com', errors: [], row_index: 0 },
        { 'First Name': 'John', 'Last Name': 'Smith', Email: 'john@example.com', errors: ['Email domain not allowed'], row_index: 1 },
      ],
    },
  ],
};

// Nested payload (version 2.0), as in Vern's docs
const nested = {
  version: '2.0',
  workbook_id: 'wb_abc123',
  company_name: 'Acme Corp',
  external_id: 'your-external-id',
  export_mode: 'nested',
  batch: { ...batch, index: 1, total: 2, size: 1 },
  root_sheets: ['Departments'],
  data: {
    Departments: [
      {
        'Department Name': 'Engineering',
        Location: 'San Francisco',
        errors: [],
        row_index: 0,
        children: {
          Employees: [{ Name: 'Jane Doe', Role: 'Engineer', Department: 'Engineering', errors: [], row_index: 0, children: {} }],
        },
      },
    ],
  },
};

describe('Vern webhook handler', () => {
  beforeEach(() => {
    process.env.VERN_WEBHOOK_SECRET = TEST_SECRET;
  });

  test('handles a flat (1.0) workbook export batch', async () => {
    const res = await send(JSON.stringify(flat));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, version: '1.0', batch_id: batch.id, batch_index: 0, last: false, records: 2 });
  });

  test('handles a nested (2.0) workbook export batch and flags the last one', async () => {
    const res = await send(JSON.stringify(nested));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, version: '2.0', batch_id: batch.id, batch_index: 1, last: true, records: 1 });
  });

  test('acknowledges payload versions it does not know', async () => {
    const res = await send(JSON.stringify({ version: '3.0', batch }));
    expect(res.status).toBe(200);
    expect(res.body.version).toBe('3.0');
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(JSON.stringify(flat), { contentType: 'application/octet-stream' });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed the same way but sent with webhook-* headers', async () => {
    const res = await send(JSON.stringify(flat), { prefix: 'webhook' });
    expect(res.status).toBe(200);
    expect(res.body.version).toBe('1.0');
  });

  test('rejects an invalid signature sent with webhook-* headers', async () => {
    const res = await send(JSON.stringify(flat), { prefix: 'webhook', signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = JSON.stringify(flat);
    const msgId = 'msg_rotation';
    const timestamp = now();
    const signature = `v1,aW52YWxpZF9zaWduYXR1cmU= ${sign(payload, msgId, timestamp)}`;
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(200);
  });

  test('rejects missing headers', async () => {
    const res = await request(app).post('/webhooks/vern').set('Content-Type', 'application/json').send('{}');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required webhook headers');
  });

  test('rejects an invalid signature', async () => {
    const res = await send(JSON.stringify(flat), { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = JSON.stringify(flat);
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign(JSON.stringify(flat), msgId, timestamp);
    const res = await send(JSON.stringify({ ...flat, workbook_id: 'wb_other' }), { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send(JSON.stringify(flat), { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Timestamp too old');
  });

  test('rejects a signed body that is not JSON', async () => {
    const res = await send('not json');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSON');
  });

  test.each(['null', '[]', '"text"'])('rejects a signed body that is not a JSON object (%s)', async (body) => {
    const res = await send(body);
    expect(res.status).toBe(400);
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.VERN_WEBHOOK_SECRET;
    const res = await send(JSON.stringify(flat));
    expect(res.status).toBe(500);
  });

  test('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
