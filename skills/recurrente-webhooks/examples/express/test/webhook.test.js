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

// prefix: 'svix' (Recurrente's own header names) or 'webhook' (Standard Webhooks names for the same values)
function send(payload, { msgId = `msg_${crypto.randomBytes(12).toString('hex')}`, timestamp = now(), signature, contentType = 'application/json', prefix = 'svix' } = {}) {
  return request(app)
    .post('/webhooks/recurrente')
    .set('Content-Type', contentType)
    .set(`${prefix}-id`, msgId)
    .set(`${prefix}-timestamp`, timestamp)
    .set(`${prefix}-signature`, signature ?? sign(payload, msgId, timestamp))
    .send(payload);
}

const events = {
  'intent.succeeded': {"type": "payment", "id": "in_id123", "status": "succeeded", "amount_in_cents": 25000, "currency": "GTQ", "details": {"fee": 875}},
  'intent.pending': {"type": "bank_transfer", "id": "in_id124", "status": "pending", "details": {"bank_reference": "ref-1"}},
  'intent.failed': {"type": "payment", "id": "in_id125", "status": "failed", "details": {"failure_reason": "insufficient_funds"}},
  'intent.canceled': {"type": "crypto", "id": "in_id126", "status": "canceled"},
  'intent.paid': {"type": "balance", "id": "in_id127", "status": "paid", "amount_in_cents": 5000, "currency": "GTQ"},
  'subscription.create': {"id": "su_id123"},
  'subscription.past_due': {"id": "su_id123"},
  'subscription.pause': {"id": "su_id123"},
  'subscription.unpause': {"id": "su_id123"},
  'subscription.reactivate': {"id": "su_id123"},
  'subscription.update': {"id": "su_id123"},
  'subscription.item_added': {"id": "su_id123", "item": {"id": "it_1"}},
  'subscription.item_removed': {"id": "su_id123", "item": {"id": "it_1"}},
  'subscription.invoice_item_added': {"id": "su_id123"},
  'subscription.cancel': {"id": "su_id123"},
  'setup_intent.succeeded': {"id": "seti_id123"},
  'setup_intent.cancelled': {"id": "seti_id123"},
  'refund.create': {"id": "re_id123"},
  'dispute.create': {"id": "dp_id123"},
  'dispute.update': {"id": "dp_id123"},
  'verification.completed': {"connected": true, "account_id": "acc_id123"},
  'verification.rejected': {"connected": true, "account_id": "acc_id123", "document_errors": [{"document": "dpi", "error": "blurry"}]},
  'tax_invoice_settings.enabled': {"connected": true, "account_id": "acc_id123", "tax_invoicing": {"status": "enabled"}},
  'account_connection.create': {"account_id": "acc_id123"},
  'transfer.sent': {"id": "tr_id123"},
  'transfer.received': {"id": "tr_id123"},
  'withdrawal.create': {"withdrawal": {"id": "wd_1", "status": "pending"}, "transfer": {"id": "tr_1", "status": "pending"}},
  'withdrawal.update': {"withdrawal": {"id": "wd_1", "status": "sent"}, "transfer": {"id": "tr_1", "status": "sent"}},
};

describe('Recurrente webhook handler', () => {
  beforeEach(() => {
    process.env.RECURRENTE_WEBHOOK_SECRET = TEST_SECRET;
  });

  test.each(Object.entries(events))('handles %s', async (type, data) => {
    const res = await send(JSON.stringify({ event_type: type, ...data }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type });
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(JSON.stringify({ event_type: 'recurrente.something.new' }));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('recurrente.something.new');
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(JSON.stringify({ event_type: 'intent.succeeded', id: 'in_id123' }), {
      contentType: 'application/octet-stream',
    });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed the same way but sent with webhook-* headers', async () => {
    const res = await send(JSON.stringify({ event_type: 'intent.succeeded', id: 'in_id123' }), { prefix: 'webhook' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type: 'intent.succeeded' });
  });

  test('rejects an invalid signature sent with webhook-* headers', async () => {
    const res = await send('{"event_type":"intent.succeeded"}', { prefix: 'webhook', signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = JSON.stringify({ event_type: 'intent.succeeded' });
    const msgId = 'msg_rotation';
    const timestamp = now();
    const signature = `v1,aW52YWxpZF9zaWduYXR1cmU= ${sign(payload, msgId, timestamp)}`;
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(200);
  });

  test('rejects missing headers', async () => {
    const res = await request(app).post('/webhooks/recurrente').set('Content-Type', 'application/json').send('{}');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required webhook headers');
  });


  test('rejects an invalid signature', async () => {
    const res = await send('{"event_type":"intent.succeeded"}', { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = '{"event_type":"intent.succeeded"}';
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign('{"event_type":"intent.failed"}', msgId, timestamp);
    const res = await send('{"event_type":"intent.succeeded"}', { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send('{"event_type":"intent.succeeded"}', { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.RECURRENTE_WEBHOOK_SECRET;
    const res = await send('{"event_type":"intent.succeeded"}');
    expect(res.status).toBe(500);
  });

  test('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
