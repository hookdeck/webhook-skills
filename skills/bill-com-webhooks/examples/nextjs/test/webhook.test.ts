// Generated with: bill-com-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/bill-com/route';
import { verifyBillSignature } from '../lib/verify-bill-com';

const SECRET = 'bill_synthetic_security_key_7f3a9c';
const BODY = '{"metadata":{"eventId":"963507c4-8e6b-48f0-ae72-ea9c93710001","subscriptionId":"f6d06930-e3e2-4509-be37-4dbda29e0001","organizationId":"00802SYNTHETICORG001","eventType":"test","version":"1"},"payload":{"createdDate":"2026-11-18T10:15:27.127+00:00"}}';
const BODY2 = '{"metadata":{"eventId":"963507c4-8e6b-48f0-ae72-ea9c93710002","subscriptionId":"f6d06930-e3e2-4509-be37-4dbda29e0001","organizationId":"00802SYNTHETICORG001","eventType":"bill.created","version":"1"},"payload":{"createdDate":"2026-11-18T10:20:00.000+00:00"}}';

const sign = (body: string, key: string | Buffer = SECRET) =>
  '' + crypto.createHmac('sha256', key).update(body).digest('base64');

const post = (body: string, signature?: string, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://localhost/webhooks/bill-com', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...headers,
        ...(signature === undefined ? {} : { 'x-bill-sha-signature': signature }),
      },
      body,
    })
  );

beforeEach(() => {
  process.env.BILL_WEBHOOK_SECURITY_KEY = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifyBillSignature', () => {
  it('accepts base64 and rejects hex', () => {
    expect(verifyBillSignature(BODY, sign(BODY), SECRET)).toBe(true);
    const other = '' + crypto.createHmac('sha256', SECRET).update(BODY).digest('hex');
    expect(verifyBillSignature(BODY, other, SECRET)).toBe(false);
  });

  it('covers the compact body as sent: a pretty-printed copy does not verify', () => {
    const pretty = JSON.stringify(JSON.parse(BODY), null, 2);
    expect(verifyBillSignature(pretty, sign(BODY), SECRET)).toBe(false);
  });
});

describe('/webhooks/bill-com', () => {

  it('accepts a valid signature', async () => {
    const res = await post(BODY, sign(BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, event_type: 'test', event_id: '963507c4-8e6b-48f0-ae72-ea9c93710001' });
  });

  it('rejects another secret, a tampered body and a missing signature header', async () => {
    expect((await post(BODY, sign(BODY, 'wrong_secret'))).status).toBe(401);
    expect((await post(BODY.replace('"eventType":"test"', '"eventType":"bill.created"'), sign(BODY))).status).toBe(401);
    expect((await post(BODY)).status).toBe(401);
  });

  it('accepts a secret with a trailing newline', async () => {
    process.env.BILL_WEBHOOK_SECURITY_KEY = `${SECRET}\n`;
    expect((await post(BODY, sign(BODY))).status).toBe(200);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"truncated": ';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('returns 500 when BILL_WEBHOOK_SECURITY_KEY is not set', async () => {
    delete process.env.BILL_WEBHOOK_SECURITY_KEY;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });
});
