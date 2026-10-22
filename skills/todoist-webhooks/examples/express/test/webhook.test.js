const request = require('supertest');
const crypto = require('crypto');

process.env.TODOIST_CLIENT_SECRET = 'test_client_secret';

const { app, verifyTodoistWebhook, seenDeliveries } = require('../src/index');

// Todoist: base64(HMAC-SHA256(client_secret, raw body))
function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64');
}

const secret = process.env.TODOIST_CLIENT_SECRET;

function event(name, data = { id: '6XR4GqQQCW6Gv9h4', content: 'Buy Milk' }) {
  return JSON.stringify({
    event_name: name,
    user_id: '2671355',
    event_data: data,
    initiator: { id: '2671355', email: 'alice@example.com', full_name: 'Alice' },
    triggered_at: '2025-02-10T10:39:38.000000Z',
    version: '10',
  });
}

describe('verifyTodoistWebhook', () => {
  it('accepts a valid signature', () => {
    const body = Buffer.from(event('item:added'));
    expect(verifyTodoistWebhook(body, sign(body, secret), secret)).toBe(true);
  });

  it('rejects a wrong signature, wrong secret, and missing header', () => {
    const body = Buffer.from(event('item:added'));
    expect(verifyTodoistWebhook(body, 'bad', secret)).toBe(false);
    expect(verifyTodoistWebhook(body, sign(body, 'other'), secret)).toBe(false);
    expect(verifyTodoistWebhook(body, undefined, secret)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const body = Buffer.from(event('item:added'));
    const sig = sign(body, secret);
    expect(verifyTodoistWebhook(Buffer.from(event('item:deleted')), sig, secret)).toBe(false);
  });
});

describe('POST /webhooks/todoist', () => {
  beforeEach(() => seenDeliveries.clear());

  it.each(['item:added', 'item:completed', 'note:added', 'project:added'])(
    'returns 200 for a signed %s event',
    async (name) => {
      const body = event(name);
      const res = await request(app)
        .post('/webhooks/todoist')
        .set('Content-Type', 'application/json')
        .set('X-Todoist-Hmac-SHA256', sign(body, secret))
        .set('X-Todoist-Delivery-ID', `d-${name}`)
        .send(body);
      expect(res.status).toBe(200);
    }
  );

  it('verifies regardless of content type', async () => {
    const body = event('item:added');
    const res = await request(app)
      .post('/webhooks/todoist')
      .set('Content-Type', 'text/plain')
      .set('X-Todoist-Hmac-SHA256', sign(body, secret))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('returns 400 for a missing signature', async () => {
    const res = await request(app)
      .post('/webhooks/todoist')
      .set('Content-Type', 'application/json')
      .send(event('item:added'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await request(app)
      .post('/webhooks/todoist')
      .set('Content-Type', 'application/json')
      .set('X-Todoist-Hmac-SHA256', 'invalid')
      .send(event('item:added'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const body = 'not json';
    const res = await request(app)
      .post('/webhooks/todoist')
      .set('Content-Type', 'text/plain')
      .set('X-Todoist-Hmac-SHA256', sign(body, secret))
      .send(body);
    expect(res.status).toBe(400);
  });

  it('acknowledges a retried delivery without reprocessing', async () => {
    const body = event('item:added');
    const send = () =>
      request(app)
        .post('/webhooks/todoist')
        .set('Content-Type', 'application/json')
        .set('X-Todoist-Hmac-SHA256', sign(body, secret))
        .set('X-Todoist-Delivery-ID', 'dup-1')
        .send(body);
    expect((await send()).text).toBe('OK');
    const second = await send();
    expect(second.status).toBe(200);
    expect(second.text).toBe('Duplicate');
  });

  it('returns 200 for unhandled events', async () => {
    const body = event('label:added');
    const res = await request(app)
      .post('/webhooks/todoist')
      .set('Content-Type', 'application/json')
      .set('X-Todoist-Hmac-SHA256', sign(body, secret))
      .send(body);
    expect(res.status).toBe(200);
  });
});
