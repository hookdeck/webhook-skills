import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// An RSA key pair stands in for Antom (signs inbound notifications).
// SHA256withRSA is the provider's algorithm.
const alipayKeys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

const alipayPublicPem = alipayKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const alipayPrivatePem = alipayKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

const CLIENT_ID = 'SANDBOX_5YC47N2ZQHJ004124';
const WEBHOOK_PATH = '/webhooks/alipay';

// Set env BEFORE importing the route (it reads process.env at module load).
process.env.ALIPAY_CLIENT_ID = CLIENT_ID;
process.env.ALIPAY_PUBLIC_KEY = alipayPublicPem;

let POST: (req: Request) => Promise<Response>;

beforeAll(async () => {
  ({ POST } = await import('../app/webhooks/alipay/route'));
});

function signInbound(
  rawBody: string,
  opts: { clientId?: string; requestTime?: string; urlEncode?: boolean } = {}
): Record<string, string> {
  const { clientId = CLIENT_ID, requestTime = '2026-07-24T10:00:00Z', urlEncode = false } = opts;
  const content = `POST ${WEBHOOK_PATH}\n${clientId}.${requestTime}.${rawBody}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(content, 'utf8');
  signer.end();
  let signature = signer.sign(alipayPrivatePem).toString('base64');
  if (urlEncode) signature = encodeURIComponent(signature);
  return {
    'Client-Id': clientId,
    'Request-Time': requestTime,
    Signature: `algorithm=RSA256,keyVersion=1,signature=${signature}`,
    'Content-Type': 'application/json',
  };
}

function paymentPayload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    notifyType: 'PAYMENT_RESULT',
    result: { resultCode: 'SUCCESS', resultStatus: 'S', resultMessage: 'success' },
    paymentRequestId: 'pay_20260724_0001',
    paymentId: '20260724194010800100188420201535803',
    paymentAmount: { value: '8000', currency: 'USD' },
    ...overrides,
  });
}

function makeRequest(body: string, headers: Record<string, string>): Request {
  return new Request(`https://example.com${WEBHOOK_PATH}`, {
    method: 'POST',
    headers,
    body,
  });
}

describe('POST /webhooks/alipay', () => {
  it('returns 400 when signature headers are missing', async () => {
    const res = await POST(
      makeRequest(paymentPayload(), { 'Content-Type': 'application/json' })
    );
    expect(res.status).toBe(400);
  });

  it('returns 401 for an invalid signature', async () => {
    const payload = paymentPayload();
    const headers = signInbound(payload);
    headers.Signature = 'algorithm=RSA256,keyVersion=1,signature=bm90LWEtc2ln';

    const res = await POST(makeRequest(payload, headers));
    expect(res.status).toBe(401);
  });

  it('returns 401 if the body is tampered after signing', async () => {
    const original = paymentPayload({ paymentAmount: { value: '8000', currency: 'USD' } });
    const headers = signInbound(original);
    const tampered = paymentPayload({ paymentAmount: { value: '999999', currency: 'USD' } });

    const res = await POST(makeRequest(tampered, headers));
    expect(res.status).toBe(401);
  });

  it('returns 200 with the fixed SUCCESS ack for a valid signature', async () => {
    const payload = paymentPayload();
    const headers = signInbound(payload);

    const res = await POST(makeRequest(payload, headers));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      result: { resultCode: 'SUCCESS', resultStatus: 'S', resultMessage: 'success' },
    });
    expect(res.headers.get('client-id')).toBe(CLIENT_ID);
    expect(res.headers.get('response-time')).toBeTruthy();
  });

  it('accepts a percent-encoded signature value', async () => {
    const payload = paymentPayload();
    const headers = signInbound(payload, { urlEncode: true });

    const res = await POST(makeRequest(payload, headers));
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
      ...(fields as Record<string, unknown>),
      result: { resultCode: 'SUCCESS', resultStatus: 'S', resultMessage: 'success' },
    });
    const headers = signInbound(payload);

    const res = await POST(makeRequest(payload, headers));
    expect(res.status).toBe(200);
  });
});
