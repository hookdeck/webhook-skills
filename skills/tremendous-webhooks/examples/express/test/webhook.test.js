const crypto = require('crypto');
const request = require('supertest');

const PRIVATE_KEY = 'test_tremendous_private_key';
process.env.TREMENDOUS_WEBHOOK_PRIVATE_KEY = PRIVATE_KEY;

const { app, verifyTremendousWebhook } = require('../src/index');

function sign(body, key = PRIVATE_KEY) {
  return 'sha256=' + crypto.createHmac('sha256', key).update(body).digest('hex');
}

const payload = (event) =>
  JSON.stringify({
    event,
    uuid: '5ccc7bb1-7659-4e23-a407-77d8cd9c62f5',
    created_utc: '2021-04-06T20:05:01.037-04:00',
    payload: { resource: { id: '2V3PCCL7QXDA', type: 'rewards' }, meta: {} },
  });

describe('verifyTremendousWebhook', () => {
  const body = Buffer.from(payload('ORDERS.APPROVED'));

  it('accepts a valid signature', () => {
    expect(verifyTremendousWebhook(body, sign(body), PRIVATE_KEY)).toBe(true);
  });

  it('accepts uppercase hex', () => {
    const header = 'sha256=' + sign(body).slice('sha256='.length).toUpperCase();
    expect(verifyTremendousWebhook(body, header, PRIVATE_KEY)).toBe(true);
  });

  it('rejects a wrong key', () => {
    expect(verifyTremendousWebhook(body, sign(body, 'other'), PRIVATE_KEY)).toBe(false);
  });

  it('rejects a tampered body', () => {
    expect(verifyTremendousWebhook(Buffer.from(payload('ORDERS.FAILED')), sign(body), PRIVATE_KEY)).toBe(false);
  });

  it('rejects a missing prefix, wrong prefix, bad hex, wrong length, and missing header', () => {
    const hex = sign(body).slice('sha256='.length);
    expect(verifyTremendousWebhook(body, hex, PRIVATE_KEY)).toBe(false);
    expect(verifyTremendousWebhook(body, 'sha1=' + hex, PRIVATE_KEY)).toBe(false);
    expect(verifyTremendousWebhook(body, 'sha256=' + 'zz'.repeat(32), PRIVATE_KEY)).toBe(false);
    expect(verifyTremendousWebhook(body, 'sha256=' + hex.slice(0, 62), PRIVATE_KEY)).toBe(false);
    expect(verifyTremendousWebhook(body, 'sha256=', PRIVATE_KEY)).toBe(false);
    expect(verifyTremendousWebhook(body, 'sha256=é' + hex.slice(1), PRIVATE_KEY)).toBe(false);
    expect(verifyTremendousWebhook(body, undefined, PRIVATE_KEY)).toBe(false);
  });
});

describe('POST /webhooks/tremendous', () => {
  const events = [
    'REWARDS.DELIVERY.SUCCEEDED', 'REWARDS.DELIVERY.FAILED', 'REWARDS.CANCELED', 'REWARDS.FLAGGED',
    'ORDERS.CREATED', 'ORDERS.APPROVED', 'ORDERS.CANCELED', 'ORDERS.FAILED',
    'CAMPAIGNS.CREATED', 'FUNDING_SOURCES.FUNDED', 'INVOICES.PAID',
  ];

  it.each(events)('accepts a signed %s event', async (event) => {
    const body = payload(event);
    const res = await request(app)
      .post('/webhooks/tremendous')
      .set('Content-Type', 'application/json')
      .set('Tremendous-Webhook-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('verifies regardless of content type', async () => {
    const body = payload('ORDERS.CREATED');
    const res = await request(app)
      .post('/webhooks/tremendous')
      .set('Content-Type', 'text/plain')
      .set('Tremendous-Webhook-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('acknowledges events without a dedicated case', async () => {
    const body = payload('PRODUCTS.UPDATED');
    const res = await request(app)
      .post('/webhooks/tremendous')
      .set('Content-Type', 'application/json')
      .set('Tremendous-Webhook-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('returns 400 for an invalid signature', async () => {
    const body = payload('ORDERS.APPROVED');
    const res = await request(app)
      .post('/webhooks/tremendous')
      .set('Content-Type', 'application/json')
      .set('Tremendous-Webhook-Signature', sign(body, 'wrong'))
      .send(body);
    expect(res.status).toBe(400);
  });

  it('returns 400 when the signature header is missing', async () => {
    const res = await request(app)
      .post('/webhooks/tremendous')
      .set('Content-Type', 'application/json')
      .send(payload('ORDERS.APPROVED'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for signed but invalid JSON', async () => {
    const body = 'not json';
    const res = await request(app)
      .post('/webhooks/tremendous')
      .set('Content-Type', 'text/plain')
      .set('Tremendous-Webhook-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(400);
  });
});
