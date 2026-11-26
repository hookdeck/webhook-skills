// Generated with: fedex-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/fedex/route';
import { verifyFedExSignature } from '../lib/verify-fedex';

const SECRET = 'SyntheticFedexToken2026abcdXYZ';
const BODY = '{"trackingNumber":"794600000001","eventType":"IT","eventDescription":"In transit","synthetic":true}';
const BODY2 = '{"trackingNumber":"794600000002","eventType":"DL","eventDescription":"Delivered","synthetic":true}';

const sign = (body: string, key: string | Buffer = SECRET) =>
  '' + crypto.createHmac('sha256', key).update(body).digest('base64');

const post = (body: string, signature?: string, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://localhost/webhooks/fedex', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...headers,
        ...(signature === undefined ? {} : { 'fdx-signature': signature }),
      },
      body,
    })
  );

beforeEach(() => {
  process.env.FEDEX_WEBHOOK_SECURITY_TOKEN = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifyFedExSignature', () => {
  it('accepts base64 and rejects hex', () => {
    expect(verifyFedExSignature(BODY, sign(BODY), SECRET)).toBe(true);
    const other = '' + crypto.createHmac('sha256', SECRET).update(BODY).digest('hex');
    expect(verifyFedExSignature(BODY, other, SECRET)).toBe(false);
  });

});

describe('/webhooks/fedex', () => {

  it('accepts a valid signature', async () => {
    const res = await post(BODY, sign(BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('rejects another secret, a tampered body and a missing signature header', async () => {
    expect((await post(BODY, sign(BODY, 'wrong_secret'))).status).toBe(401);
    expect((await post(BODY.replace('"eventType":"IT"', '"eventType":"DL"'), sign(BODY))).status).toBe(401);
    expect((await post(BODY)).status).toBe(401);
  });

  it('accepts a secret with a trailing newline', async () => {
    process.env.FEDEX_WEBHOOK_SECURITY_TOKEN = `${SECRET}\n`;
    expect((await post(BODY, sign(BODY))).status).toBe(200);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"truncated": ';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('returns 500 when FEDEX_WEBHOOK_SECURITY_TOKEN is not set', async () => {
    delete process.env.FEDEX_WEBHOOK_SECURITY_TOKEN;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });
});
