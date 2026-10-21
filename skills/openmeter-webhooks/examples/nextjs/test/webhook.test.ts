import crypto from 'node:crypto';
import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { POST } from '../app/webhooks/openmeter/route';

// OpenMeter auto-generated secrets are 'whsec_' + base64(32 random bytes)
const TEST_SECRET = 'whsec_' + Buffer.from('openmeter_test_signing_secret_32').toString('base64');

// Sign exactly as OpenMeter/Svix does:
// base64(HMAC-SHA256(base64decode(secret without whsec_), "{id}.{timestamp}.{body}"))
function sign(payload: string, secret: string, msgId: string, timestamp: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${sig}`;
}

function signedHeaders(
  payload: string,
  { secret = TEST_SECRET, timestamp }: { secret?: string; timestamp?: number } = {}
): Record<string, string> {
  const msgId = 'msg_' + crypto.randomBytes(12).toString('hex');
  const ts = String(timestamp ?? Math.floor(Date.now() / 1000));
  return {
    'svix-id': msgId,
    'svix-timestamp': ts,
    'svix-signature': sign(payload, secret, msgId, ts),
  };
}

function makeEvent(type: string, data: Record<string, unknown>): string {
  return JSON.stringify({
    id: '01J5WQFP993XTYM1HAZH3SHP2G',
    timestamp: '2024-08-22T09:43:03.209883Z',
    type,
    data,
  });
}

function post(payload: string, headers: Record<string, string>) {
  return POST(
    new Request('http://localhost:3000/webhooks/openmeter', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: payload,
    })
  );
}

const entitlementData = {
  entitlement: { id: '01J5WM25BAXSCBKG2D9NDYJB6S', featureKey: 'llm_tokens', type: 'metered' },
  feature: { id: '01J5WKAM9FJ4621ARR641JS17Q', key: 'llm_tokens', meterSlug: 'tokens_total' },
  subject: { id: '01J5WM256DNGXKG2N17AHVXKTD', key: 'customer-1' },
  threshold: { type: 'PERCENT', value: 80 },
  value: { balance: 254, hasAccess: true, overage: 0, usage: 2369 },
};

const invoiceData = { id: '01JSJ8XJ7Y0F1Q2W3E4R5T6Y7U', number: 'INV-2025-0042', status: 'draft' };

describe('OpenMeter webhook route', () => {
  beforeAll(() => {
    process.env.OPENMETER_WEBHOOK_SECRET = TEST_SECRET;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    vi.restoreAllMocks();
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
    expect(await res.json()).toEqual({ received: true, id: '01J5WQFP993XTYM1HAZH3SHP2G', type });
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

  test('returns 500 when the secret is not configured', async () => {
    const previous = process.env.OPENMETER_WEBHOOK_SECRET;
    delete process.env.OPENMETER_WEBHOOK_SECRET;
    try {
      const payload = makeEvent('invoice.created', invoiceData);
      const res = await post(payload, signedHeaders(payload));
      expect(res.status).toBe(500);
    } finally {
      process.env.OPENMETER_WEBHOOK_SECRET = previous;
    }
  });
});
