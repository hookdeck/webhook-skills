import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/revenuecat/route';
import {
  parseSignatureHeader,
  verifyAuthorizationHeader,
  verifyRevenueCatSignature,
} from '../lib/revenuecat-signature';

// RevenueCat signing secrets are opaque strings used as a UTF-8 HMAC key
// (no prefix to strip, no base64 decoding).
const SECRET = 'rc_test_signing_secret_9f2c4e1a7b3d5f80';
const AUTH = 'Bearer rc-test-auth-token-5d1e9a';

beforeEach(() => {
  process.env.REVENUECAT_WEBHOOK_SECRET = SECRET;
  process.env.REVENUECAT_WEBHOOK_AUTH = AUTH;
});

const nowSeconds = () => Math.floor(Date.now() / 1000);

function sign(payload: string, secret = SECRET, timestamp: number | string = nowSeconds()): string {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
}

/** Build X-RevenueCat-Webhook-Signature: t=<seconds>,v1=<hex> */
function signatureHeader(
  payload: string,
  { secret = SECRET, timestamp = nowSeconds() }: { secret?: string; timestamp?: number } = {}
): string {
  return `t=${timestamp},v1=${sign(payload, secret, timestamp)}`;
}

function buildEvent(type: string, extra: Record<string, unknown> = {}) {
  return {
    api_version: '1.0',
    event: {
      id: `evt-${type}-${crypto.randomUUID()}`,
      type,
      event_timestamp_ms: 1591121855319,
      app_id: 'app1234',
      app_user_id: 'user_123',
      original_app_user_id: 'user_123',
      aliases: ['user_123'],
      product_id: 'onemonth_no_trial',
      entitlement_ids: ['pro'],
      environment: 'PRODUCTION',
      store: 'APP_STORE',
      ...extra,
    },
  };
}

const initialPurchase = buildEvent('INITIAL_PURCHASE', { price: 2.49, currency: 'USD' });

function post(
  payload: string,
  { signature, auth = AUTH }: { signature?: string; auth?: string | null } = {}
) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature) headers['x-revenuecat-webhook-signature'] = signature;
  if (auth) headers['authorization'] = auth;
  return POST(
    new NextRequest('http://localhost/webhooks/revenuecat', { method: 'POST', headers, body: payload })
  );
}

describe('parseSignatureHeader', () => {
  it('parses t and v1', () => {
    expect(parseSignatureHeader('t=1700000000,v1=abc')).toEqual({
      timestamp: '1700000000',
      timestampCount: 1,
      signatures: ['abc'],
    });
  });
});

describe('verifyRevenueCatSignature', () => {
  const body = JSON.stringify(initialPurchase);

  it('accepts a valid signature', () => {
    expect(verifyRevenueCatSignature(body, signatureHeader(body), SECRET)).toEqual({ valid: true });
  });

  it('rejects a signature made with another secret', () => {
    const result = verifyRevenueCatSignature(body, signatureHeader(body, { secret: 'other' }), SECRET);
    expect(result).toEqual({ valid: false, error: 'Invalid signature' });
  });

  it('rejects a header without t or v1', () => {
    expect(verifyRevenueCatSignature(body, `v1=${sign(body)}`, SECRET).valid).toBe(false);
    expect(verifyRevenueCatSignature(body, `t=${nowSeconds()}`, SECRET).valid).toBe(false);
  });

  it('rejects timestamps more than 300 seconds from now', () => {
    for (const t of [nowSeconds() - 301, nowSeconds() + 301]) {
      expect(verifyRevenueCatSignature(body, signatureHeader(body, { timestamp: t }), SECRET)).toEqual({
        valid: false,
        error: 'Timestamp outside tolerance',
      });
    }
  });
});

describe('verifyAuthorizationHeader', () => {
  it('accepts only the exact configured value', () => {
    expect(verifyAuthorizationHeader(AUTH, AUTH)).toEqual({ valid: true });
    expect(verifyAuthorizationHeader('Bearer wrong', AUTH).valid).toBe(false);
    expect(verifyAuthorizationHeader(null, AUTH).valid).toBe(false);
  });
});

describe('POST /webhooks/revenuecat', () => {
  it('returns 200 for a valid signature and Authorization header', async () => {
    const payload = JSON.stringify(initialPurchase);
    const res = await post(payload, { signature: signatureHeader(payload) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('returns 401 when the signature header is missing', async () => {
    const res = await post(JSON.stringify(initialPurchase));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a tampered payload', async () => {
    const original = JSON.stringify(initialPurchase);
    const tampered = JSON.stringify({ ...initialPurchase, event: { ...initialPurchase.event, price: 0 } });
    const res = await post(tampered, { signature: signatureHeader(original) });
    expect(res.status).toBe(401);
  });

  it('returns 401 for a re-serialised body (verify the raw bytes)', async () => {
    const raw = JSON.stringify(initialPurchase, null, 2);
    const res = await post(JSON.stringify(JSON.parse(raw)), { signature: signatureHeader(raw) });
    expect(res.status).toBe(401);
  });

  it('returns 401 for a stale timestamp', async () => {
    const payload = JSON.stringify(initialPurchase);
    const res = await post(payload, { signature: signatureHeader(payload, { timestamp: nowSeconds() - 600 }) });
    expect(res.status).toBe(401);
  });

  it('returns 401 for a wrong Authorization header even with a valid signature', async () => {
    const payload = JSON.stringify(initialPurchase);
    const res = await post(payload, { signature: signatureHeader(payload), auth: 'Bearer wrong' });
    expect(res.status).toBe(401);
  });

  it('accepts Authorization-only mode when no signing secret is set', async () => {
    delete process.env.REVENUECAT_WEBHOOK_SECRET;
    expect((await post(JSON.stringify(initialPurchase))).status).toBe(200);
    expect((await post(JSON.stringify(initialPurchase), { auth: 'Bearer wrong' })).status).toBe(401);
  });

  it('accepts signature-only mode when no Authorization value is set', async () => {
    delete process.env.REVENUECAT_WEBHOOK_AUTH;
    const payload = JSON.stringify(initialPurchase);
    const res = await post(payload, { signature: signatureHeader(payload), auth: null });
    expect(res.status).toBe(200);
  });

  it('returns 500 when neither check is configured', async () => {
    delete process.env.REVENUECAT_WEBHOOK_SECRET;
    delete process.env.REVENUECAT_WEBHOOK_AUTH;
    expect((await post(JSON.stringify(initialPurchase))).status).toBe(500);
  });

  it('returns 400 for a verified body without an event object', async () => {
    const payload = JSON.stringify({ api_version: '1.0' });
    const res = await post(payload, { signature: signatureHeader(payload) });
    expect(res.status).toBe(400);
  });

  it('handles every documented event type and answers 200 for unknown types', async () => {
    const eventTypes = [
      'TEST',
      'INITIAL_PURCHASE',
      'RENEWAL',
      'CANCELLATION',
      'UNCANCELLATION',
      'NON_RENEWING_PURCHASE',
      'SUBSCRIPTION_PAUSED',
      'EXPIRATION',
      'BILLING_ISSUE',
      'PRODUCT_CHANGE',
      'SUBSCRIPTION_EXTENDED',
      'REFUND_REVERSED',
      'INVOICE_ISSUANCE',
      'TRANSFER',
      'TEMPORARY_ENTITLEMENT_GRANT',
      'VIRTUAL_CURRENCY_TRANSACTION',
      'EXPERIMENT_ENROLLMENT',
      'PURCHASE_REDEEMED',
      'PRICE_INCREASE_CONSENT_REQUIRED',
      'PRICE_INCREASE_CONSENT_APPROVED',
      'SOME_FUTURE_EVENT',
    ];

    for (const type of eventTypes) {
      const payload = JSON.stringify(buildEvent(type));
      const res = await post(payload, { signature: signatureHeader(payload) });
      expect(res.status).toBe(200);
    }
  });
});
