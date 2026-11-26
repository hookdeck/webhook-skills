// Generated with: checkr-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/checkr/route';
import { verifyCheckrSignature } from '../lib/verify-checkr';

const KEY = 'checkr_synthetic_test_key_4f1c9a2b7d';
const BODY = '{"id":"6a1f0c2b9e3d4a5b6c7d8e9f","object":"event","type":"report.completed","created_at":"2026-11-18T10:15:00Z","webhook_url":"https://example.com/webhooks/checkr","data":{"object":{"id":"4722c07dd9a10c3985ae432a","object":"report","status":"complete","result":"clear","package":"driver_pro"}}}';

const sign = (body: string, key = KEY) => crypto.createHmac('sha256', key).update(body).digest('hex');

const post = (body: string, signature?: string) =>
  POST(
    new Request('http://localhost/webhooks/checkr', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(signature === undefined ? {} : { 'x-checkr-signature': signature }) },
      body,
    })
  );

beforeEach(() => {
  process.env.CHECKR_SIGNING_KEY = KEY;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifyCheckrSignature', () => {
  it("matches the test vector in Checkr's webhook-verification-examples repo", () => {
    const body = '{"monday":"75F","tuesday":"80F"}';
    const signature = 'b7412f05e981a473b5ecbdb5393afaea02a679db6d7c8e56803512ec4ba98151';
    expect(verifyCheckrSignature(body, signature, 'test-secret')).toBe(true);
    expect(verifyCheckrSignature(body, signature, 'other-secret')).toBe(false);
  });

  it('rejects the placeholder Checkr sends to accounts without an API key', () => {
    expect(verifyCheckrSignature(BODY, 'Please create an API key to check the authenticity of our webhooks.', KEY)).toBe(false);
  });
});

describe('POST /webhooks/checkr', () => {
  it('accepts a valid signature', async () => {
    const res = await post(BODY, sign(BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, type: 'report.completed', id: '6a1f0c2b9e3d4a5b6c7d8e9f' });
  });

  it('rejects another key, a tampered body and a missing signature header', async () => {
    expect((await post(BODY, sign(BODY, 'some_other_api_key'))).status).toBe(401);
    expect((await post(BODY.replace('"clear"', '"consider"'), sign(BODY))).status).toBe(401);
    expect((await post(BODY)).status).toBe(401);
  });

  it('rejects the same JSON pretty-printed: the HMAC covers the exact bytes', async () => {
    expect((await post(JSON.stringify(JSON.parse(BODY), null, 2), sign(BODY))).status).toBe(401);
  });

  it('accepts a key with a trailing newline', async () => {
    process.env.CHECKR_SIGNING_KEY = `${KEY}\n`;
    expect((await post(BODY, sign(BODY))).status).toBe(200);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"truncated": ';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('returns 500 when CHECKR_SIGNING_KEY is not set', async () => {
    delete process.env.CHECKR_SIGNING_KEY;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });
});
