const crypto = require('crypto');
const request = require('supertest');

// An RSA key pair stands in for Antom (signs inbound notifications).
// SHA256withRSA exercises the same path the real provider uses.
const alipayKeys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

const alipayPublicPem = alipayKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const alipayPrivatePem = alipayKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

const CLIENT_ID = 'SANDBOX_5YC47N2ZQHJ004124';
const WEBHOOK_PATH = '/webhooks/alipay';

// Env must be set BEFORE requiring the app — index.js reads it at module load.
process.env.ALIPAY_CLIENT_ID = CLIENT_ID;
process.env.ALIPAY_PUBLIC_KEY = alipayPublicPem;

const { app } = require('../src/index');

// Build a signed inbound request the way Antom would, using the Antom private key.
function signInbound(rawBody, { clientId = CLIENT_ID, requestTime = '2026-07-24T10:00:00Z', urlEncode = false } = {}) {
  const content = `POST ${WEBHOOK_PATH}\n${clientId}.${requestTime}.${rawBody}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(content, 'utf8');
  signer.end();
  let signature = signer.sign(alipayPrivatePem).toString('base64');
  // Antom URL-encodes the base64 signature on the wire.
  if (urlEncode) signature = encodeURIComponent(signature);
  return {
    'Client-Id': clientId,
    'Request-Time': requestTime,
    Signature: `algorithm=RSA256,keyVersion=1,signature=${signature}`,
    'Content-Type': 'application/json',
  };
}

function paymentPayload(overrides = {}) {
  return JSON.stringify({
    notifyType: 'PAYMENT_RESULT',
    result: { resultCode: 'SUCCESS', resultStatus: 'S', resultMessage: 'success' },
    paymentRequestId: 'pay_20260724_0001',
    paymentId: '20260724194010800100188420201535803',
    paymentAmount: { value: '8000', currency: 'USD' },
    ...overrides,
  });
}

describe('POST /webhooks/alipay', () => {
  it('returns 400 when signature headers are missing', async () => {
    const res = await request(app)
      .post(WEBHOOK_PATH)
      .set('Content-Type', 'application/json')
      .send(paymentPayload());
    expect(res.status).toBe(400);
  });

  it('returns 401 for an invalid signature', async () => {
    const payload = paymentPayload();
    const headers = signInbound(payload);
    headers.Signature = 'algorithm=RSA256,keyVersion=1,signature=bm90LWEtc2ln';

    const res = await request(app).post(WEBHOOK_PATH).set(headers).send(payload);
    expect(res.status).toBe(401);
    expect(res.text).toBe('Invalid signature');
  });

  it('returns 401 if the body is tampered after signing', async () => {
    const original = paymentPayload({ paymentAmount: { value: '8000', currency: 'USD' } });
    const headers = signInbound(original);
    const tampered = paymentPayload({ paymentAmount: { value: '999999', currency: 'USD' } });

    const res = await request(app).post(WEBHOOK_PATH).set(headers).send(tampered);
    expect(res.status).toBe(401);
  });

  it('returns 200 with the fixed SUCCESS ack for a valid signature', async () => {
    const payload = paymentPayload();
    const headers = signInbound(payload);

    const res = await request(app).post(WEBHOOK_PATH).set(headers).send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      result: { resultCode: 'SUCCESS', resultStatus: 'S', resultMessage: 'success' },
    });
    expect(res.headers['client-id']).toBe(CLIENT_ID);
    expect(res.headers['response-time']).toBeDefined();
  });

  it('accepts a percent-encoded signature value', async () => {
    const payload = paymentPayload();
    const headers = signInbound(payload, { urlEncode: true });

    const res = await request(app).post(WEBHOOK_PATH).set(headers).send(payload);
    expect(res.status).toBe(200);
  });

  it.each([
    [{ notifyType: 'PAYMENT_RESULT', paymentRequestId: 'pay_1' }],
    [{ notifyType: 'PAYMENT_PENDING', paymentRequestId: 'pay_1' }],
    [{ notifyType: 'CAPTURE_RESULT', captureRequestId: 'cap_1', captureId: 'c_1' }],
    [{ notifyType: 'REFUND_RESULT', refundRequestId: 'ref_1', refundId: 'r_1' }],
    [{ authorizationNotifyType: 'AUTHCODE_CREATED', authState: 'state_1' }],
    [{ authorizationNotifyType: 'TOKEN_CANCELED' }],
    [{ disputeNotificationType: 'DISPUTE_CREATED', disputeId: 'dsp_1' }],
    [{ disputeNotificationType: 'DISPUTE_JUDGED', disputeId: 'dsp_1' }],
    [{ notifyType: 'SOMETHING_ELSE' }],
  ])('acknowledges %j', async (fields) => {
    const payload = JSON.stringify({
      ...fields,
      result: { resultCode: 'SUCCESS', resultStatus: 'S', resultMessage: 'success' },
    });
    const headers = signInbound(payload);

    const res = await request(app).post(WEBHOOK_PATH).set(headers).send(payload);
    expect(res.status).toBe(200);
  });
});

describe('GET /health', () => {
  it('responds 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
