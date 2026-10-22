const request = require('supertest');
const crypto = require('crypto');

const SECRET = 'test_yousign_webhook_secret';
process.env.YOUSIGN_WEBHOOK_SECRET = SECRET;

const app = require('../src/index');

function sign(body, secret = SECRET) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function payload(eventName, data = {}) {
  return JSON.stringify({
    event_id: 'b6c63685-c556-4a30-8fe9-b6f2b187d936',
    event_name: eventName,
    event_time: '1670855889',
    subscription_id: 'sub_123',
    subscription_description: 'test',
    sandbox: true,
    data,
  });
}

describe('Yousign webhook', () => {
  const events = [
    ['signature_request.activated', { signature_request: { id: 'sr_1' } }],
    ['signature_request.done', { signature_request: { id: 'sr_1' } }],
    ['signature_request.declined', { signature_request: { id: 'sr_1' } }],
    ['signer.done', { signer: { id: 's_1' } }],
    ['signer.declined', { signer: { id: 's_1' } }],
  ];

  test.each(events)('accepts valid %s', async (name, data) => {
    const body = payload(name, data);
    const res = await request(app)
      .post('/webhooks/yousign')
      .set('Content-Type', 'application/json')
      .set('X-Yousign-Signature-256', sign(body))
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  test('verifies any content type (raw body)', async () => {
    const body = payload('signer.done', { signer: { id: 's_1' } });
    const res = await request(app)
      .post('/webhooks/yousign')
      .set('Content-Type', 'text/plain')
      .set('X-Yousign-Signature-256', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  test('accepts unhandled event names with a valid signature', async () => {
    const body = payload('signer.link_opened');
    const res = await request(app)
      .post('/webhooks/yousign')
      .set('Content-Type', 'application/json')
      .set('X-Yousign-Signature-256', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  test('rejects missing signature', async () => {
    const res = await request(app)
      .post('/webhooks/yousign')
      .set('Content-Type', 'application/json')
      .send(payload('signer.done'));
    expect(res.status).toBe(400);
  });

  test('rejects wrong secret', async () => {
    const body = payload('signer.done');
    const res = await request(app)
      .post('/webhooks/yousign')
      .set('Content-Type', 'application/json')
      .set('X-Yousign-Signature-256', sign(body, 'wrong_secret'))
      .send(body);
    expect(res.status).toBe(400);
  });

  test('rejects tampered body', async () => {
    const body = payload('signer.done');
    const res = await request(app)
      .post('/webhooks/yousign')
      .set('Content-Type', 'application/json')
      .set('X-Yousign-Signature-256', sign(body))
      .send(body.replace('sub_123', 'sub_999'));
    expect(res.status).toBe(400);
  });

  test('rejects signature without sha256= prefix', async () => {
    const body = payload('signer.done');
    const bare = sign(body).slice('sha256='.length);
    const res = await request(app)
      .post('/webhooks/yousign')
      .set('Content-Type', 'application/json')
      .set('X-Yousign-Signature-256', bare)
      .send(body);
    expect(res.status).toBe(400);
  });

  test('rejects valid signature over invalid JSON', async () => {
    const body = 'not json';
    const res = await request(app)
      .post('/webhooks/yousign')
      .set('Content-Type', 'application/json')
      .set('X-Yousign-Signature-256', sign(body))
      .send(body);
    expect(res.status).toBe(400);
  });
});
