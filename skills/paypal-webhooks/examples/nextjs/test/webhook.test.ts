import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

beforeAll(() => {
  process.env.PAYPAL_WEBHOOK_ID = 'WH-TEST-WEBHOOK-ID';
});

// Import after env is set
const routeModulePromise = import('../app/webhooks/paypal/route');

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const TEST_CERT_URL =
  'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-test-360caa42';

function signPayPalRequest(
  rawBody: string,
  { webhookId = process.env.PAYPAL_WEBHOOK_ID! }: { webhookId?: string } = {}
): Record<string, string> {
  const transmissionId = 'b9e98030-d9b3-11ea-8f4a-test';
  const transmissionTime = '2024-08-22T18:23:10Z';
  const crc = zlib.crc32(Buffer.from(rawBody));
  const message = `${transmissionId}|${transmissionTime}|${webhookId}|${crc}`;
  const signer = crypto.createSign('SHA256');
  signer.update(message);
  signer.end();
  const transmissionSig = signer.sign(privateKey, 'base64');
  return {
    'paypal-transmission-id': transmissionId,
    'paypal-transmission-time': transmissionTime,
    'paypal-transmission-sig': transmissionSig,
    'paypal-cert-url': TEST_CERT_URL,
    'paypal-auth-algo': 'SHA256withRSA',
    'content-type': 'application/json',
  };
}

function makeRequest(body: string, headers: Record<string, string>): Request {
  return new Request('http://localhost/webhooks/paypal', {
    method: 'POST',
    headers,
    body,
  });
}

describe('PayPal webhook route', () => {
  it('returns 400 when paypal-* headers are missing', async () => {
    const { POST } = await routeModulePromise;
    const req = makeRequest('{"event_type":"PAYMENT.CAPTURE.COMPLETED"}', {
      'content-type': 'application/json',
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const { POST, certCache } = await routeModulePromise;
    certCache.set(TEST_CERT_URL, publicKey);

    const payload = JSON.stringify({
      id: 'WH-evt-1',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: 'cap_1' },
    });
    const headers = signPayPalRequest(payload);
    headers['paypal-transmission-sig'] = Buffer.from('garbage').toString('base64');

    const res = await POST(makeRequest(payload, headers) as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 when the cert URL is not on paypal.com', async () => {
    const { POST, certCache } = await routeModulePromise;
    certCache.set(TEST_CERT_URL, publicKey);

    const payload = JSON.stringify({
      id: 'WH-evt-2',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: 'cap_2' },
    });
    const headers = signPayPalRequest(payload);
    headers['paypal-cert-url'] = 'https://attacker.example.com/cert';

    const res = await POST(makeRequest(payload, headers) as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 when the body is tampered after signing', async () => {
    const { POST, certCache } = await routeModulePromise;
    certCache.set(TEST_CERT_URL, publicKey);

    const original = JSON.stringify({
      id: 'WH-evt-3',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: 'cap_3', amount: { value: '10.00', currency_code: 'USD' } },
    });
    const headers = signPayPalRequest(original);
    const tampered = JSON.stringify({
      id: 'WH-evt-3',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: 'cap_3', amount: { value: '999.00', currency_code: 'USD' } },
    });

    const res = await POST(makeRequest(tampered, headers) as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 when signed for a different webhook ID', async () => {
    const { POST, certCache } = await routeModulePromise;
    certCache.set(TEST_CERT_URL, publicKey);

    const payload = JSON.stringify({
      id: 'WH-evt-4',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: 'cap_4' },
    });
    const headers = signPayPalRequest(payload, { webhookId: 'WH-DIFFERENT-ID' });

    const res = await POST(makeRequest(payload, headers) as any);
    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid signature', async () => {
    const { POST, certCache } = await routeModulePromise;
    certCache.set(TEST_CERT_URL, publicKey);

    const payload = JSON.stringify({
      id: 'WH-evt-5',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: 'cap_5' },
    });
    const headers = signPayPalRequest(payload);

    const res = await POST(makeRequest(payload, headers) as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ received: true });
  });

  it.each([
    'PAYMENT.CAPTURE.COMPLETED',
    'PAYMENT.CAPTURE.REFUNDED',
    'PAYMENT.SALE.COMPLETED',
    'CHECKOUT.ORDER.APPROVED',
    'BILLING.SUBSCRIPTION.CREATED',
    'BILLING.SUBSCRIPTION.ACTIVATED',
    'BILLING.SUBSCRIPTION.CANCELLED',
    'CUSTOMER.DISPUTE.CREATED',
    'UNHANDLED.EVENT.TYPE',
  ])('handles event_type %s', async (eventType) => {
    const { POST, certCache } = await routeModulePromise;
    certCache.set(TEST_CERT_URL, publicKey);

    const payload = JSON.stringify({
      id: `WH-evt-${eventType}`,
      event_type: eventType,
      resource: { id: 'res_x', dispute_id: 'dispute_x' },
    });
    const headers = signPayPalRequest(payload);

    const res = await POST(makeRequest(payload, headers) as any);
    expect(res.status).toBe(200);
  });
});
