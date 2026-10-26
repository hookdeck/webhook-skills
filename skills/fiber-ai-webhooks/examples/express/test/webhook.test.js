import request from 'supertest';
import crypto from 'crypto';
import { app, server } from '../src/index.js';

// Svix secrets are 'whsec_' + base64(key). base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// base64(HMAC_SHA256(base64Decode(secret_after_whsec_), `${id}.${timestamp}.${payload}`))
function sign(payload, secret, timestamp, msgId) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${sig}`;
}

const newId = () => 'msg_' + crypto.randomBytes(16).toString('hex');
const now = () => Math.floor(Date.now() / 1000).toString();

function post(payload, { id = newId(), ts = now(), sig, contentType = 'application/json' } = {}) {
  return request(app)
    .post('/webhooks/fiber-ai')
    .set('Content-Type', contentType)
    .set({
      'svix-id': id,
      'svix-timestamp': ts,
      'svix-signature': sig ?? sign(payload, TEST_SECRET, ts, id),
    })
    .send(payload);
}

describe('Fiber AI Webhook Handler', () => {
  beforeAll(() => {
    process.env.FIBER_AI_WEBHOOK_SECRET = TEST_SECRET;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  test.each([
    ['reveal.completed', { type: 'reveal.completed', task_id: 'abc123', success: true }],
    ['batch_live_enrich.completed', { type: 'batch_live_enrich.completed', task_id: 't1', completed: 3, failed: 0, not_found: 1, malformed: 0 }],
    ['batch_contact_enrich.completed', { type: 'batch_contact_enrich.completed', task_id: 't2', success: true }],
    ['mosaic.completed', { type: 'mosaic.completed', task_id: 't3', success: true }],
    ['audience.enrichment_completed', { type: 'audience.enrichment_completed', audience_id: 'a1', success: true }],
    ['tracker.signal_detected', { type: 'tracker.signal_detected', eventId: 'e1', occurredAt: '2026-01-01T00:00:00Z' }],
    ['job.changed', { type: 'job.changed', profiles: [{ listId: 'l1' }] }],
  ])('processes a valid %s webhook', async (type, body) => {
    const res = await post(JSON.stringify(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type });
  });

  test('recognises job.changed by its profiles array when no type is sent', async () => {
    const res = await post(JSON.stringify({ profiles: [{ listId: 'l1' }] }));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('job.changed');
  });

  test('verifies a body sent with any content type', async () => {
    const res = await post(JSON.stringify({ type: 'reveal.completed', task_id: 'x' }), { contentType: 'text/plain' });
    expect(res.status).toBe(200);
  });

  test('accepts any matching entry in a multi-signature header (rotation)', async () => {
    const payload = JSON.stringify({ type: 'reveal.completed', task_id: 'x' });
    const id = newId();
    const ts = now();
    const good = sign(payload, TEST_SECRET, ts, id);
    const res = await post(payload, { id, ts, sig: `v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= ${good}` });
    expect(res.status).toBe(200);
  });

  test('returns 200 for unknown event types', async () => {
    const res = await post(JSON.stringify({ type: 'something.new' }));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('something.new');
  });

  test('rejects an invalid signature', async () => {
    const res = await post(JSON.stringify({ type: 'reveal.completed' }), { sig: 'v1,invalidsignature' });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const id = newId();
    const ts = now();
    const sig = sign(JSON.stringify({ type: 'reveal.completed', task_id: 'a' }), TEST_SECRET, ts, id);
    const res = await post(JSON.stringify({ type: 'reveal.completed', task_id: 'b' }), { id, ts, sig });
    expect(res.status).toBe(400);
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const payload = JSON.stringify({ type: 'reveal.completed' });
    const id = newId();
    const ts = (Math.floor(Date.now() / 1000) - 600).toString();
    const res = await post(payload, { id, ts });
    expect(res.status).toBe(400);
  });

  test('rejects missing headers', async () => {
    const res = await request(app)
      .post('/webhooks/fiber-ai')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ type: 'reveal.completed' }));
    expect(res.status).toBe(400);
  });

  test('rejects an invalid JSON body that is correctly signed', async () => {
    const res = await post('not json');
    expect(res.status).toBe(400);
  });
});
