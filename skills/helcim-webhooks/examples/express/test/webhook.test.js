const crypto = require('node:crypto');
const request = require('supertest');
const app = require('../src/index');

// Helcim's verifierToken is bare base64 (no whsec_ prefix); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';
const OTHER_SECRET = 'b3RoZXJfc2VjcmV0X2tleQ==';

// Standard Webhooks algorithm: base64(HMAC-SHA256(base64-decoded token, `${id}.${timestamp}.${body}`))
function sign(payload, msgId, timestamp, secret = TEST_SECRET) {
  const key = Buffer.from(secret, 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${signature}`;
}

function now() {
  return Math.floor(Date.now() / 1000).toString();
}

function send(
  payload,
  { msgId = `msg_${crypto.randomBytes(12).toString('hex')}`, timestamp = now(), signature, contentType = 'application/json', prefix = 'webhook' } = {}
) {
  return request(app)
    .post('/webhooks/helcim')
    .set('Content-Type', contentType)
    .set(`${prefix}-id`, msgId)
    .set(`${prefix}-timestamp`, timestamp)
    .set(`${prefix}-signature`, signature ?? sign(payload, msgId, timestamp))
    .send(payload);
}

const cardTransaction = () => JSON.stringify({ id: '25764674', type: 'cardTransaction' });
const terminalCancel = () =>
  JSON.stringify({
    data: {
      cancelledAt: '2026-01-14T18:38:18Z',
      currency: 'CAD',
      customerCode: '',
      deviceCode: 'NBL7',
      invoiceNumber: '',
      transactionAmount: 1,
    },
    type: 'terminalCancel',
  });

describe('Helcim webhook handler', () => {
  beforeEach(() => {
    process.env.HELCIM_WEBHOOK_SECRET = TEST_SECRET;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });

  test('handles cardTransaction', async () => {
    const res = await send(cardTransaction());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, type: 'cardTransaction' });
  });

  test('handles terminalCancel', async () => {
    const res = await send(terminalCancel());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, type: 'terminalCancel' });
  });

  test('acknowledges an event type it does not handle', async () => {
    const res = await send(JSON.stringify({ type: 'somethingNew' }));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('somethingNew');
  });

  test('accepts a delivery signed the same way but sent with svix-* headers', async () => {
    const res = await send(cardTransaction(), { prefix: 'svix' });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('cardTransaction');
  });

  test('prefers the webhook-* headers when both sets are present', async () => {
    const payload = cardTransaction();
    const msgId = 'msg_both';
    const timestamp = now();
    const res = await request(app)
      .post('/webhooks/helcim')
      .set('Content-Type', 'application/json')
      .set('webhook-id', msgId)
      .set('webhook-timestamp', timestamp)
      .set('webhook-signature', sign(payload, msgId, timestamp))
      .set('svix-id', 'msg_other')
      .set('svix-timestamp', timestamp)
      .set('svix-signature', 'v1,AAAA')
      .send(payload);
    expect(res.status).toBe(200);
  });

  test('accepts the same token configured with a whsec_ prefix', async () => {
    process.env.HELCIM_WEBHOOK_SECRET = `whsec_${TEST_SECRET}`;
    const res = await send(cardTransaction());
    expect(res.status).toBe(200);
  });

  test('verifies the raw bytes whatever the content type', async () => {
    const res = await send(cardTransaction(), { contentType: 'text/plain' });
    expect(res.status).toBe(200);
  });

  test('verifies the exact raw bytes, including odd whitespace', async () => {
    const res = await send('{ "id" : "25764674",\n "type":"cardTransaction" }');
    expect(res.status).toBe(200);
  });

  test('accepts any matching v1 entry and ignores other versions', async () => {
    const payload = cardTransaction();
    const msgId = 'msg_multi';
    const timestamp = now();
    const good = sign(payload, msgId, timestamp);
    const bad = sign(payload, msgId, timestamp, OTHER_SECRET);
    const res = await send(payload, { msgId, timestamp, signature: `v1a,ignored ${bad} ${good}` });
    expect(res.status).toBe(200);
  });

  test('rejects a missing signature header', async () => {
    const res = await request(app)
      .post('/webhooks/helcim')
      .set('Content-Type', 'application/json')
      .set('webhook-id', 'msg_1')
      .set('webhook-timestamp', now())
      .send(cardTransaction());
    expect(res.status).toBe(400);
  });

  test('rejects a request with no webhook headers', async () => {
    const res = await request(app).post('/webhooks/helcim').set('Content-Type', 'application/json').send(cardTransaction());
    expect(res.status).toBe(400);
  });

  test('rejects an invalid signature', async () => {
    const res = await send(cardTransaction(), { signature: 'v1,aW52YWxpZA==' });
    expect(res.status).toBe(401);
  });

  test('rejects a signature made with another token', async () => {
    const payload = cardTransaction();
    const msgId = 'msg_other_secret';
    const timestamp = now();
    const res = await send(payload, { msgId, timestamp, signature: sign(payload, msgId, timestamp, OTHER_SECRET) });
    expect(res.status).toBe(401);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign(cardTransaction(), msgId, timestamp);
    const res = await send(terminalCancel(), { msgId, timestamp, signature });
    expect(res.status).toBe(401);
  });

  test('rejects a stale timestamp (library window is 5 minutes)', async () => {
    const payload = cardTransaction();
    const msgId = 'msg_stale';
    const timestamp = (Math.floor(Date.now() / 1000) - 600).toString();
    const res = await send(payload, { msgId, timestamp, signature: sign(payload, msgId, timestamp) });
    expect(res.status).toBe(401);
  });

  test('returns 400 for a verified body that is not JSON', async () => {
    const res = await send('not json');
    expect(res.status).toBe(400);
  });

  test('fails closed when the secret is not configured', async () => {
    delete process.env.HELCIM_WEBHOOK_SECRET;
    const res = await send(cardTransaction());
    expect(res.status).toBe(500);
  });
});
