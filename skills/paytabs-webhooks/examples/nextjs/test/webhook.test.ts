import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { verifyPayTabsSignature } from '../lib/verify';
import { POST } from '../app/webhooks/paytabs/route';

const SECRET = 'test_profile_server_key_0123456789';

beforeAll(() => {
  process.env.PAYTABS_WEBHOOK_SECRET = SECRET;
});

// Same algorithm as PayTabs: hex(HMAC-SHA256(rawBody, profile ServerKey))
function sign(body: string | Buffer, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

// Payload as shown in the PayTabs docs (a declined Sale)
const transaction = {
  tran_ref: 'TST2234801409691',
  merchant_id: 31237,
  profile_id: 81784,
  cart_id: 'cart_11111',
  cart_currency: 'EGP',
  cart_amount: '500.00',
  tran_currency: 'EGP',
  tran_total: '500.00',
  tran_type: 'Sale',
  tran_class: 'ECom',
  customer_details: { name: 'Mohammed EL Rayes', email: 'mohammed.elrayes@paytabs.com', country: 'EG' },
  payment_result: {
    response_status: 'D',
    response_code: '344',
    response_message: 'Acquirer is unable to process this request',
    transaction_time: '2022-12-14T15:53:58Z',
  },
  payment_info: { payment_method: 'Visa', card_type: 'Credit', card_scheme: 'Visa' },
  ipn_trace: 'IPNS0004.6399F196.00000FD3',
};
const authorised = (overrides: Record<string, unknown> = {}) => ({
  ...transaction,
  payment_result: { ...transaction.payment_result, response_status: 'A', response_message: 'Authorised' },
  ...overrides,
});

function post(body: string, signature?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature !== undefined) headers['signature'] = signature;
  return POST(
    new NextRequest('http://localhost:3000/webhooks/paytabs', { method: 'POST', headers, body })
  );
}

// Published vector from the PayTabs signature article (the Return URL worked example).
// The body is the canonical string PayTabs hashes there; it exercises the same
// HMAC-SHA256 / lowercase hex primitive, with the exact bytes below.
const VECTOR = {
  secret: 'SGJNZ96JLG-JDMKHGRWT9-RWRK2KJNRJ',
  body: 'cartId=cart_11111&customerEmail=email%40domain.com&respCode=G84718&respMessage=Authorised&respStatus=A&tranRef=TST2215201242166',
  signature: '7a181a32c768621eb6966107752ee70205a01f1c4403a3d13c0ff604f591f988',
};

describe('verifyPayTabsSignature', () => {
  const body = Buffer.from(JSON.stringify(transaction));

  it('accepts the published PayTabs test vector', () => {
    expect(verifyPayTabsSignature(Buffer.from(VECTOR.body), VECTOR.signature, VECTOR.secret)).toBe(true);
  });

  it('accepts a valid digest, in either case', () => {
    expect(verifyPayTabsSignature(body, sign(body), SECRET)).toBe(true);
    expect(verifyPayTabsSignature(body, sign(body).toUpperCase(), SECRET)).toBe(true);
  });

  it('rejects malformed values without throwing', () => {
    expect(verifyPayTabsSignature(body, '', SECRET)).toBe(false);
    expect(verifyPayTabsSignature(body, 'abcd', SECRET)).toBe(false);
    expect(verifyPayTabsSignature(body, 'z'.repeat(64), SECRET)).toBe(false);
    expect(verifyPayTabsSignature(body, `${sign(body)}00`, SECRET)).toBe(false);
    expect(verifyPayTabsSignature(body, `sha256=${sign(body)}`, SECRET)).toBe(false);
    expect(verifyPayTabsSignature(body, undefined, SECRET)).toBe(false);
  });

  it('rejects a wrong secret or missing secret', () => {
    expect(verifyPayTabsSignature(body, sign(body, 'other_key'), SECRET)).toBe(false);
    expect(verifyPayTabsSignature(body, sign(body), undefined)).toBe(false);
  });
});

describe('POST /webhooks/paytabs', () => {
  it('accepts a valid signature and the documented transaction payload', async () => {
    const body = JSON.stringify(transaction);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies the exact bytes received, not a re-serialized body', async () => {
    const body = JSON.stringify(transaction, null, 4);
    expect((await post(body, sign(body))).status).toBe(200);
  });

  it('verifies any content type', async () => {
    const body = JSON.stringify(transaction);
    expect((await post(body, sign(body), 'text/plain')).status).toBe(200);
  });

  it.each([authorised(), authorised({ tran_type: 'Refund' }), authorised({ tran_type: 'Auth' }), transaction])(
    'handles transaction %#',
    async (payload) => {
      const body = JSON.stringify(payload);
      expect((await post(body, sign(body))).status).toBe(200);
    }
  );

  it('returns 401 when the signature header is missing or empty', async () => {
    const body = JSON.stringify(transaction);
    expect((await post(body)).status).toBe(401);
    expect((await post(body, '')).status).toBe(401);
  });

  it('returns 401 for a malformed signature', async () => {
    const body = JSON.stringify(transaction);
    expect((await post(body, 'nothex')).status).toBe(401);
    expect((await post(body, sign(body).slice(0, 62))).status).toBe(401);
  });

  it('returns 401 for a signature from the wrong key', async () => {
    const body = JSON.stringify(transaction);
    expect((await post(body, sign(body, 'other_key'))).status).toBe(401);
  });

  it('returns 401 when the body was tampered with', async () => {
    const body = JSON.stringify(transaction);
    const tampered = JSON.stringify({ ...transaction, tran_total: '1.00' });
    expect((await post(tampered, sign(body))).status).toBe(401);
  });

  it('returns 400 for a validly signed body that is not JSON', async () => {
    const body = 'not json';
    expect((await post(body, sign(body), 'text/plain')).status).toBe(400);
  });

  it('returns 400 for a validly signed JSON body that is not an object', async () => {
    for (const body of ['[]', 'null', '"text"', '42']) {
      expect((await post(body, sign(body))).status).toBe(400);
    }
  });

  it('ignores wrong-typed fields instead of failing', async () => {
    const payloads = [
      { tran_type: 123, payment_result: 'x' },
      { tran_type: 'Sale', payment_result: ['A'] },
      { tran_type: 'Sale', payment_result: { response_status: 5 }, tran_ref: 9 },
      { tran_type: ['Sale'], payment_result: null },
      {},
    ];
    for (const payload of payloads) {
      const body = JSON.stringify(payload);
      expect((await post(body, sign(body))).status).toBe(200);
    }
  });
});
