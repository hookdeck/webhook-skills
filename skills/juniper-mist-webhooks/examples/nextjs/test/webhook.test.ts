// Generated with: juniper-mist-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/juniper-mist/route';
import { verifyMistSignature } from '../lib/verify-juniper-mist';

const SECRET = 'mist_synthetic_webhook_secret_4b1e';
const BODY = '{"topic":"audits","events":[{"admin_name":"Synthetic Admin","id":"5f1e2d3c-0000-4000-8000-000000000001","message":"Update Site Settings","org_id":"9a1b2c3d-0000-4000-8000-000000000001","site_id":"7e6d5c4b-0000-4000-8000-000000000001","src_ip":"192.0.2.10","timestamp":1763460900.123}]}';
const BODY2 = '{"topic":"device-events","events":[{"device_name":"AP-Lobby","device_type":"ap","mac":"5c5b35000001","org_id":"9a1b2c3d-0000-4000-8000-000000000001","site_id":"7e6d5c4b-0000-4000-8000-000000000001","site_name":"HQ","timestamp":1763461200,"type":"AP_RESTARTED"},{"device_name":"AP-Lobby","device_type":"ap","mac":"5c5b35000001","org_id":"9a1b2c3d-0000-4000-8000-000000000001","site_id":"7e6d5c4b-0000-4000-8000-000000000001","site_name":"HQ","timestamp":1763461260,"type":"AP_CONFIGURED"}]}';

const sign = (body: string, key: string | Buffer = SECRET) =>
  '' + crypto.createHmac('sha256', key).update(body).digest('hex');

const post = (body: string, signature?: string, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://localhost/webhooks/juniper-mist', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...headers,
        ...(signature === undefined ? {} : { 'x-mist-signature-v2': signature }),
      },
      body,
    })
  );

beforeEach(() => {
  process.env.MIST_WEBHOOK_SECRET = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifyMistSignature', () => {
  it('accepts hex and rejects base64', () => {
    expect(verifyMistSignature(BODY, sign(BODY), SECRET)).toBe(true);
    const other = '' + crypto.createHmac('sha256', SECRET).update(BODY).digest('base64');
    expect(verifyMistSignature(BODY, other, SECRET)).toBe(false);
  });

  it('rejects the v1 HMAC-SHA1 value in place of v2', () => {
    expect(verifyMistSignature(BODY, crypto.createHmac('sha1', SECRET).update(BODY).digest('hex'), SECRET)).toBe(false);
  });
});

describe('/webhooks/juniper-mist', () => {

  it('accepts a valid signature', async () => {
    const res = await post(BODY, sign(BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, topic: 'audits', events: 1 });
  });

  it('rejects another secret, a tampered body and a missing signature header', async () => {
    expect((await post(BODY, sign(BODY, 'wrong_secret'))).status).toBe(401);
    expect((await post(BODY.replace('"Update Site Settings"', '"Delete Site"'), sign(BODY))).status).toBe(401);
    expect((await post(BODY)).status).toBe(401);
  });

  it('rejects a request with only the v1 header, accepts v2 alongside v1', async () => {
    expect((await post(BODY, undefined, { 'x-mist-signature': crypto.createHmac('sha1', SECRET).update(BODY).digest('hex') })).status).toBe(401);
    expect((await post(BODY, sign(BODY), { 'x-mist-signature': crypto.createHmac('sha1', SECRET).update(BODY).digest('hex') })).status).toBe(200);
  });
  it('accepts a secret with a trailing newline', async () => {
    process.env.MIST_WEBHOOK_SECRET = `${SECRET}\n`;
    expect((await post(BODY, sign(BODY))).status).toBe(200);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"truncated": ';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('returns 500 when MIST_WEBHOOK_SECRET is not set', async () => {
    delete process.env.MIST_WEBHOOK_SECRET;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });
});
