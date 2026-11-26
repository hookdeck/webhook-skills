// Generated with: monnify-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/monnify/route';
import { verifyMonnifySignature } from '../lib/verify-monnify';

const SECRET = 'MONNIFYSYNTHETICCLIENTSECRET0001';
const BODY = '{"eventType":"SUCCESSFUL_TRANSACTION","eventData":{"product":{"reference":"SYNTH-ORDER-0001","type":"WEB_SDK"},"transactionReference":"MNFY|20261118101500|000001","paymentReference":"SYNTH-ORDER-0001","paidOn":"2026-11-18 10:15:00.0","paymentDescription":"Synthetic order","amountPaid":"1500.00","totalPayable":"1500.00","paymentMethod":"ACCOUNT_TRANSFER","currency":"NGN","settlementAmount":"1490.00","paymentStatus":"PAID","customer":{"name":"Test Customer","email":"customer@example.com"}}}';
const BODY2 = '{"eventType":"SUCCESSFUL_REFUND","eventData":{"transactionReference":"MNFY|20261118101500|000001","refundReference":"SYNTH-REFUND-0001","refundAmount":"1500.00","refundStatus":"COMPLETED"}}';

const sign = (body: string, key: string | Buffer = SECRET) =>
  '' + crypto.createHmac('sha512', key).update(body).digest('hex');

const post = (body: string, signature?: string, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://localhost/webhooks/monnify', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...headers,
        ...(signature === undefined ? {} : { 'monnify-signature': signature }),
      },
      body,
    })
  );

beforeEach(() => {
  process.env.MONNIFY_CLIENT_SECRET = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifyMonnifySignature', () => {
  it('accepts hex and rejects base64', () => {
    expect(verifyMonnifySignature(BODY, sign(BODY), SECRET)).toBe(true);
    const other = '' + crypto.createHmac('sha512', SECRET).update(BODY).digest('base64');
    expect(verifyMonnifySignature(BODY, other, SECRET)).toBe(false);
  });

  it('rejects plain SHA-512 of secret + body (the docs prose): Monnify uses HMAC', () => {
    const plain = crypto.createHash('sha512').update(SECRET + BODY).digest('hex');
    expect(verifyMonnifySignature(BODY, plain, SECRET)).toBe(false);
  });
});

describe('/webhooks/monnify', () => {

  it('accepts a valid signature', async () => {
    const res = await post(BODY, sign(BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, event_type: 'SUCCESSFUL_TRANSACTION', reference: 'MNFY|20261118101500|000001' });
  });

  it('rejects another secret, a tampered body and a missing signature header', async () => {
    expect((await post(BODY, sign(BODY, 'wrong_secret'))).status).toBe(401);
    expect((await post(BODY.replace('"amountPaid":"1500.00"', '"amountPaid":"15000.00"'), sign(BODY))).status).toBe(401);
    expect((await post(BODY)).status).toBe(401);
  });

  it('accepts a secret with a trailing newline', async () => {
    process.env.MONNIFY_CLIENT_SECRET = `${SECRET}\n`;
    expect((await post(BODY, sign(BODY))).status).toBe(200);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"truncated": ';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('returns 500 when MONNIFY_CLIENT_SECRET is not set', async () => {
    delete process.env.MONNIFY_CLIENT_SECRET;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });
});
