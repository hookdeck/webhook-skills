// Generated with: payfit-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/payfit/route';
import { verifyPayfitWebhook } from '../lib/verify-payfit';

const SECRET = 'whsec_D0GCbp+5KpS3D+Br/8bijPSMm7LkLj1m'; // synthetic
const BODY = '{"type":"payroll.run","data":{"companyId":"602e441f3e724b4d74a9cc87","effectiveDate":"2026-11-18T13:02:33+00:00","payrollMonth":"202611"}}';
const KEY = Buffer.from(SECRET.slice('whsec_'.length), 'base64');

const sign = (body: string, { key = KEY, id = 'msg_2pT9xY4bW8cN1qR3', timestamp = String(Math.floor(Date.now() / 1000)) } = {}) => ({
  'svix-id': id,
  'svix-timestamp': timestamp,
  'svix-signature': `v1,${crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')}`,
});

const post = (body: string, headers: Record<string, string> = {}) =>
  POST(new Request('http://localhost/webhooks/payfit', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body }));

beforeEach(() => {
  process.env.PAYFIT_WEBHOOK_SECRET = SECRET;
  delete process.env.PAYFIT_WEBHOOK_TOLERANCE_SECONDS;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifyPayfitWebhook', () => {
  it("matches the example in Svix's manual verification guide", () => {
    const headers = {
      'svix-id': 'msg_loFOjxBNrRLzqYUf',
      'svix-timestamp': '1731705121',
      'svix-signature': 'v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=',
    };
    expect(verifyPayfitWebhook('{"event_type":"ping","data":{"success":true}}', headers, 'whsec_plJ3nmyCDGBKInavdOK15jsl')).toBe(true);
  });
});

describe('POST /webhooks/payfit', () => {
  it('accepts a valid signature', async () => {
    const res = await post(BODY, sign(BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, type: 'payroll.run', company_id: '602e441f3e724b4d74a9cc87' });
  });

  it('rejects a signature keyed with the secret as UTF-8 text instead of its decoded bytes', async () => {
    expect((await post(BODY, sign(BODY, { key: Buffer.from(SECRET, 'utf8') }))).status).toBe(401);
  });

  it('rejects another secret, a tampered body and a missing header', async () => {
    expect((await post(BODY, sign(BODY, { key: crypto.randomBytes(24) }))).status).toBe(401);
    expect((await post(BODY.replace('202611', '202612'), sign(BODY))).status).toBe(401);
    const headers: Record<string, string> = sign(BODY);
    delete headers['svix-signature'];
    expect((await post(BODY, headers)).status).toBe(401);
  });

  it('rejects an old timestamp only when PAYFIT_WEBHOOK_TOLERANCE_SECONDS is set', async () => {
    const old = sign(BODY, { timestamp: String(Math.floor(Date.now() / 1000) - 3600) });
    expect((await post(BODY, old)).status).toBe(200);
    process.env.PAYFIT_WEBHOOK_TOLERANCE_SECONDS = '300';
    expect((await post(BODY, old)).status).toBe(401);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"truncated": ';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('returns 500 when the secret is missing or not valid base64', async () => {
    delete process.env.PAYFIT_WEBHOOK_SECRET;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
    process.env.PAYFIT_WEBHOOK_SECRET = 'whsec_not*base64!';
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });
});
