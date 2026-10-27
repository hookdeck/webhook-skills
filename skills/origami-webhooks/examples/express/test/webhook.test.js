import crypto from 'node:crypto';
import request from 'supertest';
import { app } from '../src/index.js';

// Standard Webhooks secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Standard Webhooks algorithm: base64(HMAC-SHA256(decoded secret, `${id}.${timestamp}.${body}`))
function sign(payload, msgId, timestamp, secret = TEST_SECRET) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${signature}`;
}

function now() {
  return Math.floor(Date.now() / 1000).toString();
}

// prefix: 'webhook' (Origami's Standard Webhooks names) or 'svix' (the same values under Svix's names)
function send(payload, { msgId = `msg_${crypto.randomBytes(12).toString('hex')}`, timestamp = now(), signature, contentType = 'application/json', prefix = 'webhook' } = {}) {
  return request(app)
    .post('/webhooks/origami')
    .set('Content-Type', contentType)
    .set(`${prefix}-id`, msgId)
    .set(`${prefix}-timestamp`, timestamp)
    .set(`${prefix}-signature`, signature ?? sign(payload, msgId, timestamp))
    .send(payload);
}

const sender = { id: '0b1c6a54-2d3e-4f50-8a61-7b2c9d0e1f23', email: 'sdr@example.com', linkedin_slug: null, display_name: 'Sam SDR' };
const outreachTarget = { table_id: 'a1', row_id: 'b2', column_id: 'c3', email: 'lead@example.com', linkedin_urn: null, linkedin_slug: 'lead-slug' };
const sequenceFields = { sequence_id: 's1', campaign_id: 'camp_1', step_index: 0, outreach_target: outreachTarget, sender };
const jobData = (status, extra = {}) => ({
  job_id: 'job_01J', operation: 'leads.searches.create', status, sequence: 3, target: null,
  metadata: { order: '42' }, credits: null, summary: { list_id: 'list_1', added: 25 }, error: null, needs_input: null, ...extra,
});

// Documented `data` shapes (see references/overview.md)
const events = {
  'job.succeeded': jobData('succeeded'),
  'job.failed': jobData('failed', { error: { code: 'agent_error', message: 'Search failed' } }),
  'job.cancelled': jobData('cancelled'),
  'job.needs_input': jobData('needs_input', { needs_input: { questions: [{ id: 'q1', text: 'Which region?' }] } }),
  'table.run.completed': { run_id: 'r1', table_id: 't1', source: 'api', status: 'complete', failure_reason: null, counts: { complete: 9, errored: 1, cancelled: 0 } },
  'sequence.message.sent': { channel: 'email', ...sequenceFields, message_id: 'm1', message: { subject: 'Hi', body: 'Hello', body_truncated: false, provider_id: 'gmail_1', thread_id: null, rfc_message_id: null }, sent_at: '2026-10-26T12:00:00Z' },
  'sequence.reply.received': { channel: 'linkedin', ...sequenceFields, newly_stopped: true, reply_message: { subject: null, body: 'Sounds good', received_at: '2026-10-26T12:05:00Z' } },
  'sequence.connection.requested': { channel: 'linkedin', ...sequenceFields, message_id: 'm2', message: { subject: null, body: '', body_truncated: false, provider_id: null, thread_id: null, rfc_message_id: null }, sent_at: '2026-10-26T12:00:00Z' },
  'sequence.connection.accepted': { channel: 'linkedin', ...sequenceFields, original_message_id: 'm2', requested_at: '2026-10-25T12:00:00Z', connected_at: '2026-10-26T12:00:00Z' },
  'sequence.comment.posted': { channel: 'linkedin', ...sequenceFields, message_id: 'm3', comment: { body: 'Great post', body_truncated: false, comment_id: 'cm1', post_url: 'https://www.linkedin.com/feed/update/1' }, posted_at: '2026-10-26T12:00:00Z' },
  'webhook.test': { triggered_by: 'dashboard', triggered_at: '2026-10-26T12:00:00Z', message: 'Test event from Origami' },
};

// Envelope: { type, id, timestamp, data }. `id` equals the webhook-id header; `timestamp` is the event time.
function envelope(type, data = events[type]) {
  return JSON.stringify({ type, id: 'evt_01J', timestamp: '2026-10-26T12:00:00.000Z', data });
}

describe('Origami webhook handler', () => {
  beforeEach(() => {
    process.env.ORIGAMI_WEBHOOK_SECRET = TEST_SECRET;
  });

  test.each(Object.keys(events))('handles %s', async (type) => {
    const res = await send(envelope(type));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type });
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send(envelope('origami.something.new', {}));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('origami.something.new');
  });

  test('verifies regardless of request content type', async () => {
    const res = await send(envelope('job.failed'), { contentType: 'application/octet-stream' });
    expect(res.status).toBe(200);
  });

  test('accepts a delivery signed the same way but sent with svix-* headers', async () => {
    const res = await send(envelope('table.run.completed'), { prefix: 'svix' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type: 'table.run.completed' });
  });

  test('rejects an invalid signature sent with svix-* headers', async () => {
    const res = await send(envelope('table.run.completed'), { prefix: 'svix', signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = envelope('sequence.reply.received');
    const msgId = 'msg_rotation';
    const timestamp = now();
    const signature = `v1,aW52YWxpZF9zaWduYXR1cmU= ${sign(payload, msgId, timestamp)}`;
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(200);
  });

  test('ignores signature versions other than v1', async () => {
    const payload = envelope('sequence.reply.received');
    const msgId = 'msg_v1a';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp).replace('v1,', 'v1a,');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects missing headers', async () => {
    const res = await request(app).post('/webhooks/origami').set('Content-Type', 'application/json').send('{}');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required webhook headers');
  });

  test('rejects an invalid signature', async () => {
    const res = await send(envelope('job.failed'), { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = envelope('job.failed');
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign(envelope('job.failed'), msgId, timestamp);
    const res = await send(envelope('job.succeeded'), { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send(envelope('job.failed'), { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.ORIGAMI_WEBHOOK_SECRET;
    const res = await send(envelope('job.failed'));
    expect(res.status).toBe(500);
  });

  test('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
