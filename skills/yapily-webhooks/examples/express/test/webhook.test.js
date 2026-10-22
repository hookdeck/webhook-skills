const request = require('supertest');
const crypto = require('crypto');

// Secret returned once at webhook registration
process.env.YAPILY_WEBHOOK_SECRET = 'test_yapily_secret';

const { app, verifyYapilyWebhook } = require('../src/index');

const secret = process.env.YAPILY_WEBHOOK_SECRET;

// Yapily: lowercase hex HMAC-SHA256 of the raw body, key = secret as UTF-8
function sign(payload, key = secret) {
  return crypto.createHmac('sha256', Buffer.from(key, 'utf-8')).update(payload).digest('hex');
}

function makeEvent(type, event = {}) {
  return JSON.stringify({
    id: '41285f64-5717-4562-b3fc-2c961236afa6',
    applicationId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    type,
    event,
    metadata: { tracingId: '6cf5ef06-9f96-4f24-8bab-32ab09128010', user: { key: 'value' } },
  });
}

describe('verifyYapilyWebhook', () => {
  const body = makeEvent('single_payment.status.completed', { status: 'COMPLETED' });

  it('accepts a valid webhook-signature', () => {
    expect(verifyYapilyWebhook(body, [sign(body), undefined], secret)).toBe(true);
  });

  it('accepts an uppercase signature (case-insensitive)', () => {
    expect(verifyYapilyWebhook(body, [sign(body).toUpperCase()], secret)).toBe(true);
  });

  it('accepts a valid webhook-rotation-signature when the primary is stale', () => {
    expect(verifyYapilyWebhook(body, ['0'.repeat(64), sign(body)], secret)).toBe(true);
  });

  it('rejects a signature made with the wrong secret', () => {
    expect(verifyYapilyWebhook(body, [sign(body, 'other')], secret)).toBe(false);
  });

  it('rejects a tampered body', () => {
    expect(verifyYapilyWebhook(body + ' ', [sign(body)], secret)).toBe(false);
  });

  it('rejects a signature of the wrong length without throwing', () => {
    expect(verifyYapilyWebhook(body, ['abc'], secret)).toBe(false);
  });

  it('rejects when no signatures are present', () => {
    expect(verifyYapilyWebhook(body, [undefined, undefined], secret)).toBe(false);
  });
});

describe('POST /webhooks/yapily', () => {
  const events = [
    'single_payment.status.completed',
    'single_payment.status.updated',
    'single_payment.iso_status.updated',
    'hosted_pis.payment_status.completed.v1',
    'hosted_pis.payment_status.failed.v1',
  ];

  it.each(events)('accepts %s', async (type) => {
    const body = makeEvent(type, { status: 'COMPLETED' });
    const res = await request(app)
      .post('/webhooks/yapily')
      .set('Content-Type', 'application/json')
      .set('webhook-signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('verifies regardless of content type', async () => {
    const body = makeEvent('single_payment.status.completed');
    const res = await request(app)
      .post('/webhooks/yapily')
      .set('Content-Type', 'text/plain')
      .set('webhook-signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('accepts a request signed only in webhook-rotation-signature', async () => {
    const body = makeEvent('single_payment.status.completed');
    const res = await request(app)
      .post('/webhooks/yapily')
      .set('Content-Type', 'application/json')
      .set('webhook-signature', '0'.repeat(64))
      .set('webhook-rotation-signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('returns 200 for unknown event types', async () => {
    const body = makeEvent('some.future.type');
    const res = await request(app)
      .post('/webhooks/yapily')
      .set('Content-Type', 'application/json')
      .set('webhook-signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('returns 400 for an invalid signature', async () => {
    const body = makeEvent('single_payment.status.completed');
    const res = await request(app)
      .post('/webhooks/yapily')
      .set('Content-Type', 'application/json')
      .set('webhook-signature', 'f'.repeat(64))
      .send(body);
    expect(res.status).toBe(400);
  });

  it('returns 400 when the signature header is missing', async () => {
    const res = await request(app)
      .post('/webhooks/yapily')
      .set('Content-Type', 'application/json')
      .send(makeEvent('single_payment.status.completed'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for validly signed non-JSON', async () => {
    const body = 'not json';
    const res = await request(app)
      .post('/webhooks/yapily')
      .set('Content-Type', 'text/plain')
      .set('webhook-signature', sign(body))
      .send(body);
    expect(res.status).toBe(400);
  });
});
