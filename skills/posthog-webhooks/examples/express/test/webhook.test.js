const crypto = require('crypto');
const request = require('supertest');

// whsec_ + base64 of 32 bytes (PostHog requires at least 24 decoded bytes)
const SECRET = 'whsec_' + Buffer.from('test_secret_key_32_bytes_long!!!!').toString('base64');
process.env.POSTHOG_WEBHOOK_SECRET = SECRET;

const app = require('../src/index');

function sign(body, { id = 'msg_test_1', timestamp = Math.floor(Date.now() / 1000), secret = SECRET } = {}) {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  return { 'webhook-id': id, 'webhook-timestamp': String(timestamp), 'webhook-signature': `v1,${sig}` };
}

const pageview = JSON.stringify({
  event: { event: '$pageview', uuid: '0190-abc', distinct_id: 'user_1', properties: { $current_url: 'https://example.com' }, timestamp: '2026-10-22T10:00:00Z' },
  person: { id: 'p1', properties: {} },
});

describe('PostHog webhook', () => {
  it('accepts a valid signature', async () => {
    const res = await request(app).post('/webhooks/posthog').set('Content-Type', 'application/json').set(sign(pageview)).send(pageview);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('verifies regardless of content type', async () => {
    const res = await request(app).post('/webhooks/posthog').set('Content-Type', 'text/plain').set(sign(pageview)).send(pageview);
    expect(res.status).toBe(200);
  });

  it('handles $identify and custom events', async () => {
    for (const name of ['$identify', 'signed_up']) {
      const body = JSON.stringify({ event: { event: name, distinct_id: 'u' }, person: {} });
      const res = await request(app).post('/webhooks/posthog').set('Content-Type', 'application/json').set(sign(body)).send(body);
      expect(res.status).toBe(200);
    }
  });

  it('rejects a tampered body', async () => {
    const res = await request(app).post('/webhooks/posthog').set('Content-Type', 'application/json').set(sign(pageview)).send(pageview.replace('user_1', 'user_2'));
    expect(res.status).toBe(400);
  });

  it('rejects a wrong secret', async () => {
    const other = 'whsec_' + Buffer.from('another_secret_key_32_bytes_long!').toString('base64');
    const res = await request(app).post('/webhooks/posthog').set('Content-Type', 'application/json').set(sign(pageview, { secret: other })).send(pageview);
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp outside the 5 minute window', async () => {
    const old = Math.floor(Date.now() / 1000) - 600;
    const res = await request(app).post('/webhooks/posthog').set('Content-Type', 'application/json').set(sign(pageview, { timestamp: old })).send(pageview);
    expect(res.status).toBe(400);
  });

  it('rejects missing headers', async () => {
    const res = await request(app).post('/webhooks/posthog').set('Content-Type', 'application/json').send(pageview);
    expect(res.status).toBe(400);
  });
});
