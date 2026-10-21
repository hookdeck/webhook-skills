const crypto = require('crypto');
const request = require('supertest');

// Whop secrets are "ws_" + 64 hex chars and are used as the literal UTF-8 HMAC key.
const TEST_SECRET = 'ws_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.WHOP_WEBHOOK_SECRET = TEST_SECRET;

const app = require('../src/index');

// Standard Webhooks signature as Whop produces it: HMAC-SHA256 over
// "{id}.{timestamp}.{body}" keyed with the literal secret, base64, prefixed "v1,".
function sign(body, { id = 'msg_test123', timestamp = Math.floor(Date.now() / 1000), secret = TEST_SECRET } = {}) {
  const signature = crypto.createHmac('sha256', secret).update(`${id}.${timestamp}.${body}`).digest('base64');
  return {
    'content-type': 'application/json',
    'webhook-id': id,
    'webhook-timestamp': String(timestamp),
    'webhook-signature': `v1,${signature}`,
  };
}

function event(type, data = { id: 'pay_XXXXXXXX' }) {
  return JSON.stringify({
    id: 'msg_test123',
    type,
    api_version: 'v1',
    timestamp: new Date().toISOString(),
    account_id: 'biz_XXXXXXXX',
    data,
  });
}

describe('Whop webhook endpoint', () => {
  it.each([
    'payment.succeeded',
    'payment.failed',
    'membership.activated',
    'membership.deactivated',
    'refund.created',
  ])('accepts a valid %s event', async (type) => {
    const body = event(type);
    const res = await request(app).post('/webhooks/whop').set(sign(body)).send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts an unhandled event type', async () => {
    const body = event('product.updated');
    const res = await request(app).post('/webhooks/whop').set(sign(body)).send(body);
    expect(res.status).toBe(200);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = event('payment.succeeded');
    const headers = sign(body, { secret: 'ws_wrong' });
    const res = await request(app).post('/webhooks/whop').set(headers).send(body);
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = event('payment.succeeded');
    const headers = sign(body);
    const res = await request(app).post('/webhooks/whop').set(headers).send(event('refund.created'));
    expect(res.status).toBe(400);
  });

  it('rejects a secret that was base64-decoded or had its prefix stripped', async () => {
    const body = event('payment.succeeded');
    const headers = sign(body, { secret: TEST_SECRET.slice(3) });
    const res = await request(app).post('/webhooks/whop').set(headers).send(body);
    expect(res.status).toBe(400);
  });

  it('rejects missing signature headers', async () => {
    const body = event('payment.succeeded');
    const res = await request(app).post('/webhooks/whop').set('content-type', 'application/json').send(body);
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp older than 5 minutes', async () => {
    const body = event('payment.succeeded');
    const headers = sign(body, { timestamp: Math.floor(Date.now() / 1000) - 600 });
    const res = await request(app).post('/webhooks/whop').set(headers).send(body);
    expect(res.status).toBe(400);
  });
});
