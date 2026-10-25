import { describe, test, expect, beforeAll } from '@jest/globals';
import crypto from 'node:crypto';
import request from 'supertest';

// Svix-style secret: "whsec_" + base64 of the key bytes
const SECRET = 'whsec_' + Buffer.from('beehiiv_test_secret_key_bytes_01').toString('base64');
process.env.BEEHIIV_WEBHOOK_SECRET = SECRET;

let app;
let verifyBeehiivWebhook;
beforeAll(async () => {
  ({ app, verifyBeehiivWebhook } = await import('../src/index.js'));
});

// Sign the same way beehiiv/Svix does: HMAC-SHA256 over `${id}.${ts}.${body}`, base64
function sign(body, { id = 'msg_2abc', ts = Math.floor(Date.now() / 1000), secret = SECRET } = {}) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
  return { 'svix-id': id, 'svix-timestamp': String(ts), 'svix-signature': `v1,${sig}` };
}

const envelope = (event_type, data = {}, uid = 'evt_' + Math.random().toString(36).slice(2)) =>
  JSON.stringify({ uid, event_type, event_timestamp: 1792922400, data });

const post = (body, headers = {}, contentType = 'application/json') => {
  const r = request(app).post('/webhooks/beehiiv').set('Content-Type', contentType);
  for (const [k, v] of Object.entries(headers)) r.set(k, v);
  return r.send(body);
};

describe('verifyBeehiivWebhook', () => {
  const body = envelope('subscription.created', { email: 'ada@example.com' });

  test('accepts a valid signature and returns the parsed event', () => {
    const event = verifyBeehiivWebhook(body, sign(body));
    expect(event.event_type).toBe('subscription.created');
  });

  test('accepts when any space-separated v1 entry matches', () => {
    const h = sign(body);
    h['svix-signature'] = `v1,${Buffer.from('nope').toString('base64')} ${h['svix-signature']}`;
    expect(() => verifyBeehiivWebhook(body, h)).not.toThrow();
  });

  test('rejects a wrong secret', () => {
    const other = 'whsec_' + Buffer.from('some_other_key_bytes').toString('base64');
    expect(() => verifyBeehiivWebhook(body, sign(body, { secret: other }))).toThrow();
  });

  test('rejects a tampered body', () => {
    expect(() => verifyBeehiivWebhook(body + ' ', sign(body))).toThrow();
  });

  test('rejects a timestamp older than 5 minutes (library window)', () => {
    const old = Math.floor(Date.now() / 1000) - 600;
    expect(() => verifyBeehiivWebhook(body, sign(body, { ts: old }))).toThrow();
  });
});

describe('POST /webhooks/beehiiv', () => {
  test('returns 200 for each documented event type', async () => {
    for (const type of [
      'post.sent',
      'post.updated',
      'post.scheduled',
      'subscription.created',
      'subscription.confirmed',
      'subscription.deleted',
      'subscription.upgraded',
      'subscription.downgraded',
      'subscription.paused',
      'subscription.resumed',
      'newsletter_list_subscription.subscribed',
      'survey.response_submitted',
      'podcasts.episode.published',
      'something.new',
    ]) {
      const body = envelope(type, { id: 'x_1', email: 'ada@example.com' });
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
    }
  });

  test('verifies any content type (raw body)', async () => {
    const body = envelope('post.sent', { id: 'post_1' });
    const res = await post(body, sign(body), 'application/vnd.beehiiv+json');
    expect(res.status).toBe(200);
  });

  test('acknowledges a duplicate uid without reprocessing', async () => {
    const body = envelope('post.sent', { id: 'post_1' }, 'evt_dup');
    await post(body, sign(body));
    const res = await post(body, sign(body, { id: 'msg_retry' }));
    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(true);
  });

  test('returns 400 for an invalid signature', async () => {
    const body = envelope('post.sent');
    const res = await post(body, sign(body, { secret: 'whsec_' + Buffer.from('wrong').toString('base64') }));
    expect(res.status).toBe(400);
  });

  test('returns 400 for missing headers', async () => {
    const res = await post(envelope('post.sent'));
    expect(res.status).toBe(400);
  });

  test('returns 400 for a stale timestamp', async () => {
    const body = envelope('post.sent');
    const res = await post(body, sign(body, { ts: Math.floor(Date.now() / 1000) - 3600 }));
    expect(res.status).toBe(400);
  });

  test('health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
