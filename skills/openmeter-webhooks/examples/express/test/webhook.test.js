import crypto from 'node:crypto';
import { jest } from '@jest/globals';
import request from 'supertest';

// OpenMeter auto-generated secrets are 'whsec_' + base64(32 random bytes)
const TEST_SECRET = 'whsec_' + Buffer.from('openmeter_test_signing_secret_32').toString('base64');
process.env.OPENMETER_WEBHOOK_SECRET = TEST_SECRET;

const { default: app } = await import('../src/index.js');

// Sign exactly as OpenMeter/Svix does:
// base64(HMAC-SHA256(base64decode(secret without whsec_), "{id}.{timestamp}.{body}"))
function sign(payload, secret, msgId, timestamp) {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${sig}`;
}

function signedHeaders(payload, { secret = TEST_SECRET, timestamp } = {}) {
  const msgId = 'msg_' + crypto.randomBytes(12).toString('hex');
  const ts = String(timestamp ?? Math.floor(Date.now() / 1000));
  return {
    'svix-id': msgId,
    'svix-timestamp': ts,
    'svix-signature': sign(payload, secret, msgId, ts),
  };
}

function makeEvent(type, data) {
  return JSON.stringify({
    id: '01J5WQFP993XTYM1HAZH3SHP2G',
    timestamp: '2024-08-22T09:43:03.209883Z',
    type,
    data,
  });
}

const entitlementData = {
  entitlement: { id: '01J5WM25BAXSCBKG2D9NDYJB6S', featureKey: 'llm_tokens', type: 'metered' },
  feature: { id: '01J5WKAM9FJ4621ARR641JS17Q', key: 'llm_tokens', meterSlug: 'tokens_total' },
  subject: { id: '01J5WM256DNGXKG2N17AHVXKTD', key: 'customer-1' },
  threshold: { type: 'PERCENT', value: 80 },
  value: { balance: 254, hasAccess: true, overage: 0, usage: 2369 },
};

const invoiceData = { id: '01JSJ8XJ7Y0F1Q2W3E4R5T6Y7U', number: 'INV-2025-0042', status: 'draft' };

function post(payload, headers) {
  return request(app)
    .post('/webhooks/openmeter')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(payload);
}

describe('OpenMeter webhook handler', () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  test.each([
    ['entitlements.balance.threshold', entitlementData],
    ['entitlements.reset', entitlementData],
    ['invoice.created', invoiceData],
    ['invoice.updated', invoiceData],
  ])('accepts a valid %s webhook', async (type, data) => {
    const payload = makeEvent(type, data);
    const res = await post(payload, signedHeaders(payload));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, id: '01J5WQFP993XTYM1HAZH3SHP2G', type });
  });

  test('accepts unknown event types once verified', async () => {
    const payload = makeEvent('some.future.event', {});
    const res = await post(payload, signedHeaders(payload));
    expect(res.status).toBe(200);
  });

  test('accepts a valid signature among several (secret rotation)', async () => {
    const payload = makeEvent('invoice.created', invoiceData);
    const headers = signedHeaders(payload);
    headers['svix-signature'] = `v1,${Buffer.from('not-the-signature').toString('base64')} ${headers['svix-signature']}`;
    const res = await post(payload, headers);
    expect(res.status).toBe(200);
  });

  test('rejects an invalid signature', async () => {
    const payload = makeEvent('entitlements.reset', entitlementData);
    const headers = signedHeaders(payload);
    headers['svix-signature'] = 'v1,' + Buffer.from('invalid').toString('base64');
    const res = await post(payload, headers);
    expect(res.status).toBe(400);
  });

  test('rejects a signature made with the wrong secret', async () => {
    const payload = makeEvent('entitlements.reset', entitlementData);
    const wrong = 'whsec_' + Buffer.from('some_other_secret_value_32_bytes').toString('base64');
    const res = await post(payload, signedHeaders(payload, { secret: wrong }));
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const payload = makeEvent('invoice.updated', invoiceData);
    const headers = signedHeaders(payload);
    const res = await post(payload.replace('draft', 'paid'), headers);
    expect(res.status).toBe(400);
  });

  test('rejects a stale timestamp', async () => {
    const payload = makeEvent('invoice.created', invoiceData);
    const res = await post(payload, signedHeaders(payload, { timestamp: Math.floor(Date.now() / 1000) - 600 }));
    expect(res.status).toBe(400);
  });

  test('rejects missing signature headers', async () => {
    const payload = makeEvent('invoice.created', invoiceData);
    const res = await post(payload, {});
    expect(res.status).toBe(400);
  });

  test('a custom secret without whsec_ verifies the same way (base64 decoded)', async () => {
    const raw = Buffer.from('openmeter_test_signing_secret_32').toString('base64');
    const previous = process.env.OPENMETER_WEBHOOK_SECRET;
    process.env.OPENMETER_WEBHOOK_SECRET = raw;
    try {
      const payload = makeEvent('invoice.created', invoiceData);
      const res = await post(payload, signedHeaders(payload));
      expect(res.status).toBe(200);
    } finally {
      process.env.OPENMETER_WEBHOOK_SECRET = previous;
    }
  });

  test('health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
