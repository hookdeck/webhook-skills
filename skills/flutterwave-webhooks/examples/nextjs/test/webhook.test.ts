// Generated with: flutterwave-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/flutterwave/route';
import { verifyFlutterwaveWebhook } from '../lib/verify-flutterwave';

// Test-only secret hash (you choose it in Settings > Webhooks).
const SECRET_HASH = 'flw-test-secret-hash-7c1e';

/** Sign like Flutterwave v4: base64 HMAC-SHA256 of the raw body. */
const signV4 = (rawBody: string, secret = SECRET_HASH) =>
  crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');

let counter = 0;
const nextId = () => `wbk_test${Date.now().toString(36)}${++counter}`;

const v4Charge = (id = nextId()) =>
  JSON.stringify({
    id,
    timestamp: 1735116884019,
    type: 'charge.completed',
    data: { id: 'chg_Hq4oBRTJ4r', amount: 2500, currency: 'KES', status: 'succeeded' },
  });

const v4Transfer = () =>
  JSON.stringify({
    webhook_id: nextId(),
    timestamp: 1739877172874,
    type: 'transfer.disburse',
    data: { id: 'trf_yMZATJ11yVPNkZ', type: 'BANK', amount: 50000, status: 'SUCCESSFUL' },
  });

const v3Charge = (status = 'successful') =>
  JSON.stringify({
    event: 'charge.completed',
    data: { id: 285959875, tx_ref: 'Links-616626414629', amount: 100, currency: 'NGN', status },
    'event.type': 'CARD_TRANSACTION',
  });

const post = (rawBody: string, headers: Record<string, string>) =>
  POST(
    new Request('http://localhost/webhooks/flutterwave', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: rawBody,
    })
  );

beforeEach(() => {
  process.env.FLUTTERWAVE_SECRET_HASH = SECRET_HASH;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('verifyFlutterwaveWebhook', () => {
  it('matches the documented test vector', () => {
    const body =
      '{"webhook_id":"wbk_test0001","timestamp":1739877172874,"type":"charge.completed","data":{"id":"chg_test0001","status":"succeeded"}}';
    const headers = new Headers({ 'flutterwave-signature': 'XyZb/PVeYo0px7D4KQpa/nS7KkPGH1fK7X84YdQO2Ms=' });
    expect(verifyFlutterwaveWebhook(body, headers, SECRET_HASH)).toBe('v4');
  });

  it('returns v3 for a matching verif-hash and null otherwise', () => {
    expect(verifyFlutterwaveWebhook('{}', new Headers({ 'verif-hash': SECRET_HASH }), SECRET_HASH)).toBe('v3');
    expect(verifyFlutterwaveWebhook('{}', new Headers({ 'verif-hash': 'nope' }), SECRET_HASH)).toBeNull();
    expect(verifyFlutterwaveWebhook('{}', new Headers(), SECRET_HASH)).toBeNull();
  });
});

describe('v4 (flutterwave-signature)', () => {
  it('accepts charge.completed with a valid signature', async () => {
    const body = v4Charge();
    const res = await post(body, { 'flutterwave-signature': signV4(body) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, version: 'v4' });
    expect(console.log).toHaveBeenCalledWith('Charge chg_Hq4oBRTJ4r succeeded: 2500 KES');
  });

  it('accepts transfer.disburse', async () => {
    const body = v4Transfer();
    const res = await post(body, { 'flutterwave-signature': signV4(body) });
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith('Transfer trf_yMZATJ11yVPNkZ SUCCESSFUL');
  });

  it('rejects another secret, a tampered body and a hex digest', async () => {
    const body = v4Charge();
    expect((await post(body, { 'flutterwave-signature': signV4(body, 'other') })).status).toBe(401);
    expect((await post(body.replace('2500', '250000'), { 'flutterwave-signature': signV4(body) })).status).toBe(401);
    const hex = crypto.createHmac('sha256', SECRET_HASH).update(body).digest('hex');
    expect((await post(body, { 'flutterwave-signature': hex })).status).toBe(401);
  });

  it('rejects the secret hash itself in flutterwave-signature', async () => {
    expect((await post(v4Charge(), { 'flutterwave-signature': SECRET_HASH })).status).toBe(401);
  });

  it('does not fall back to verif-hash when a v4 signature is present but wrong', async () => {
    const body = v4Charge();
    const res = await post(body, { 'flutterwave-signature': signV4(body, 'wrong'), 'verif-hash': SECRET_HASH });
    expect(res.status).toBe(401);
  });

  it('returns 200 duplicate for a repeated webhook ID', async () => {
    const body = v4Charge('wbk_duplicate_check_1');
    const headers = { 'flutterwave-signature': signV4(body) };
    expect((await post(body, headers)).status).toBe(200);
    expect(await (await post(body, headers)).json()).toEqual({ received: true, duplicate: true });
  });
});

describe('v3 (verif-hash)', () => {
  it('accepts charge.completed with a matching verif-hash', async () => {
    const res = await post(v3Charge(), { 'verif-hash': SECRET_HASH });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, version: 'v3' });
  });

  it('rejects a wrong verif-hash', async () => {
    expect((await post(v3Charge(), { 'verif-hash': 'wrong-hash' })).status).toBe(401);
  });
});

describe('other failures', () => {
  it('rejects a request with neither header', async () => {
    expect((await post(v4Charge(), {})).status).toBe(401);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"type": "charge.completed",';
    expect((await post(body, { 'flutterwave-signature': signV4(body) })).status).toBe(400);
  });

  it('returns 500 when FLUTTERWAVE_SECRET_HASH is not set', async () => {
    delete process.env.FLUTTERWAVE_SECRET_HASH;
    const body = v4Charge();
    expect((await post(body, { 'flutterwave-signature': signV4(body) })).status).toBe(500);
  });
});
