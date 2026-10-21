const request = require('supertest');
const crypto = require('crypto');

// RevenueCat signing secrets are opaque strings used as a UTF-8 HMAC key
// (no prefix to strip, no base64 decoding).
const SECRET = 'rc_test_signing_secret_9f2c4e1a7b3d5f80';
const AUTH = 'Bearer rc-test-auth-token-5d1e9a';
process.env.REVENUECAT_WEBHOOK_SECRET = SECRET;
process.env.REVENUECAT_WEBHOOK_AUTH = AUTH;

const app = require('../src/index');
const { verifyRevenueCatSignature, verifyAuthorizationHeader, parseSignatureHeader } = app;

const nowSeconds = () => Math.floor(Date.now() / 1000);

function sign(payload, secret = SECRET, timestamp = nowSeconds()) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
}

/** Build X-RevenueCat-Webhook-Signature: t=<seconds>,v1=<hex> */
function signatureHeader(payload, { secret = SECRET, timestamp = nowSeconds() } = {}) {
  return `t=${timestamp},v1=${sign(payload, secret, timestamp)}`;
}

function buildEvent(type, extra = {}) {
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

function post(payload, { signature, auth = AUTH } = {}) {
  const req = request(app).post('/webhooks/revenuecat').set('Content-Type', 'application/json');
  if (signature) req.set('X-RevenueCat-Webhook-Signature', signature);
  if (auth) req.set('Authorization', auth);
  return req.send(payload);
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
    expect(verifyRevenueCatSignature(Buffer.from(body), signatureHeader(body), SECRET)).toEqual({ valid: true });
  });

  it('rejects a signature made with another secret', () => {
    const header = signatureHeader(body, { secret: 'other_secret' });
    expect(verifyRevenueCatSignature(Buffer.from(body), header, SECRET).error).toBe('Invalid signature');
  });

  it('rejects a missing header', () => {
    expect(verifyRevenueCatSignature(Buffer.from(body), undefined, SECRET).error).toMatch(/Missing/);
  });

  it('rejects a header without t or v1', () => {
    expect(verifyRevenueCatSignature(Buffer.from(body), `v1=${sign(body)}`, SECRET).error).toMatch(/Malformed/);
    expect(verifyRevenueCatSignature(Buffer.from(body), `t=${nowSeconds()}`, SECRET).error).toMatch(/Malformed/);
  });

  it('rejects a non-decimal t', () => {
    const header = `t=1e9,v1=${sign(body, SECRET, '1e9')}`;
    expect(verifyRevenueCatSignature(Buffer.from(body), header, SECRET).error).toMatch(/Malformed/);
  });

  it('rejects timestamps more than 300 seconds from now', () => {
    for (const t of [nowSeconds() - 301, nowSeconds() + 301]) {
      const header = signatureHeader(body, { timestamp: t });
      expect(verifyRevenueCatSignature(Buffer.from(body), header, SECRET).error).toMatch(/Timestamp/);
    }
  });
});

describe('verifyAuthorizationHeader', () => {
  it('accepts the exact configured value', () => {
    expect(verifyAuthorizationHeader(AUTH, AUTH)).toEqual({ valid: true });
  });

  it('rejects a different value or length', () => {
    expect(verifyAuthorizationHeader('Bearer wrong', AUTH).valid).toBe(false);
    expect(verifyAuthorizationHeader(`${AUTH}x`, AUTH).valid).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(verifyAuthorizationHeader(undefined, AUTH).error).toMatch(/Missing/);
  });
});

describe('POST /webhooks/revenuecat', () => {
  afterEach(() => {
    process.env.REVENUECAT_WEBHOOK_SECRET = SECRET;
    process.env.REVENUECAT_WEBHOOK_AUTH = AUTH;
  });

  it('returns 200 for a valid signature and Authorization header', async () => {
    const payload = JSON.stringify(initialPurchase);
    const res = await post(payload, { signature: signatureHeader(payload) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('returns 401 when the signature header is missing', async () => {
    const res = await post(JSON.stringify(initialPurchase));
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('X-RevenueCat-Webhook-Signature');
  });

  it('returns 401 for an invalid signature', async () => {
    const res = await post(JSON.stringify(initialPurchase), {
      signature: `t=${nowSeconds()},v1=${'0'.repeat(64)}`,
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid signature');
  });

  it('returns 401 for a tampered payload', async () => {
    const original = JSON.stringify(initialPurchase);
    const tampered = JSON.stringify({ ...initialPurchase, event: { ...initialPurchase.event, price: 0 } });
    const res = await post(tampered, { signature: signatureHeader(original) });
    expect(res.status).toBe(401);
  });

  it('returns 401 for a re-serialised body (verify the raw bytes)', async () => {
    const raw = JSON.stringify(initialPurchase, null, 2);
    const reserialised = JSON.stringify(JSON.parse(raw));
    const res = await post(reserialised, { signature: signatureHeader(raw) });
    expect(res.status).toBe(401);
  });

  it('returns 401 for a stale timestamp', async () => {
    const payload = JSON.stringify(initialPurchase);
    const res = await post(payload, { signature: signatureHeader(payload, { timestamp: nowSeconds() - 600 }) });
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Timestamp');
  });

  it('returns 401 for a wrong Authorization header even with a valid signature', async () => {
    const payload = JSON.stringify(initialPurchase);
    const res = await post(payload, { signature: signatureHeader(payload), auth: 'Bearer wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid Authorization header');
  });

  it('accepts Authorization-only mode when no signing secret is set', async () => {
    delete process.env.REVENUECAT_WEBHOOK_SECRET;
    const ok = await post(JSON.stringify(initialPurchase));
    expect(ok.status).toBe(200);
    const bad = await post(JSON.stringify(initialPurchase), { auth: 'Bearer wrong' });
    expect(bad.status).toBe(401);
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
    const res = await post(JSON.stringify(initialPurchase));
    expect(res.status).toBe(500);
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

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
