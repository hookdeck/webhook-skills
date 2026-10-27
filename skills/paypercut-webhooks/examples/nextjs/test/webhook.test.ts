import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { DELETE, GET, PATCH, POST, PUT } from '../app/webhooks/paypercut/route';
import { verifyPaypercutSignature } from '../lib/verify-paypercut';

const SECRET = 'whsec_paypercut_test_secret_Key-123';
const URL = 'http://localhost:3000/webhooks/paypercut';

// Signed exactly as Paypercut signs: hex HMAC-SHA256(secret, `${t}.${rawBody}`)
function sign(body: string, t: string = String(Math.floor(Date.now() / 1000)), secret: string = SECRET) {
  const v1 = crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(`${t}.`), Buffer.from(body, 'utf8')]))
    .digest('hex');
  return { t, v1, header: `t=${t},v1=${v1}` };
}

const payment = JSON.stringify({ type: 'payment.succeeded', data: { id: 'pay_123', amount: 1000 } });
const bytes = (s: string) => new Uint8Array(Buffer.from(s, 'utf8'));

function req(method: string, headers: Record<string, string> = {}, body?: string): NextRequest {
  return new NextRequest(URL, { method, headers, body });
}

beforeEach(() => {
  process.env.PAYPERCUT_WEBHOOK_SECRET = SECRET;
  delete process.env.PAYPERCUT_WEBHOOK_TOLERANCE_SECONDS;
});

afterEach(() => {
  delete process.env.PAYPERCUT_WEBHOOK_TOLERANCE_SECONDS;
});

describe('verifyPaypercutSignature', () => {
  it('accepts a valid signature, and uppercase hex', () => {
    const { header, v1 } = sign(payment);
    expect(verifyPaypercutSignature(bytes(payment), header, SECRET, 0)).toBe(true);
    expect(verifyPaypercutSignature(bytes(payment), header.replace(v1, v1.toUpperCase()), SECRET, 0)).toBe(true);
  });

  it('accepts when any v1 entry matches and ignores other keys', () => {
    const { t, v1 } = sign(payment);
    const bad = 'a'.repeat(64);
    expect(verifyPaypercutSignature(bytes(payment), `t=${t},v1=${bad},v0=zzz,v1=${v1}`, SECRET, 0)).toBe(true);
  });

  it('uses t exactly as sent (no number reformatting)', () => {
    const { header } = sign(payment, '0001768991448');
    expect(verifyPaypercutSignature(bytes(payment), header, SECRET, 0)).toBe(true);
  });

  it('rejects tampered body, wrong secret, missing t, missing v1 and junk', () => {
    const { header, t, v1 } = sign(payment);
    expect(verifyPaypercutSignature(bytes(payment + ' '), header, SECRET, 0)).toBe(false);
    expect(verifyPaypercutSignature(bytes(payment), header, 'other', 0)).toBe(false);
    expect(verifyPaypercutSignature(bytes(payment), `v1=${v1}`, SECRET, 0)).toBe(false);
    expect(verifyPaypercutSignature(bytes(payment), `t=,v1=${v1}`, SECRET, 0)).toBe(false);
    expect(verifyPaypercutSignature(bytes(payment), `t=${t}`, SECRET, 0)).toBe(false);
    expect(verifyPaypercutSignature(bytes(payment), `t=${t},v1=${v1}00`, SECRET, 0)).toBe(false);
    expect(verifyPaypercutSignature(bytes(payment), `t=${t},v1=${v1.slice(0, 62)}zz`, SECRET, 0)).toBe(false);
    expect(verifyPaypercutSignature(bytes(payment), null, SECRET, 0)).toBe(false);
    expect(verifyPaypercutSignature(bytes(payment), '', SECRET, 0)).toBe(false);
  });

  it('applies the tolerance only when it is set', () => {
    const old = sign(payment, String(Math.floor(Date.now() / 1000) - 3600));
    expect(verifyPaypercutSignature(bytes(payment), old.header, SECRET, 0)).toBe(true);
    expect(verifyPaypercutSignature(bytes(payment), old.header, SECRET, 300)).toBe(false);
    expect(verifyPaypercutSignature(bytes(payment), sign(payment).header, SECRET, 300)).toBe(true);
  });
});

describe('POST /webhooks/paypercut', () => {
  it('accepts a signed payment.succeeded event', async () => {
    const res = await POST(req('POST', { 'content-type': 'application/json', 'paypercut-signature': sign(payment).header }, payment));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('works with any content type and verifies the exact bytes', async () => {
    const odd = '{"type":"payout.paid",  "data":{"id":"po_1"}}\n';
    const res = await POST(req('POST', { 'content-type': 'text/plain', 'paypercut-signature': sign(odd).header }, odd));
    expect(res.status).toBe(200);
  });

  it('acknowledges unknown event types', async () => {
    const body = JSON.stringify({ type: 'person.created', data: { id: 'p_1' } });
    const res = await POST(req('POST', { 'paypercut-signature': sign(body).header }, body));
    expect(res.status).toBe(200);
  });

  it('rejects a missing, malformed or mismatched signature with 401', async () => {
    expect((await POST(req('POST', {}, payment))).status).toBe(401);
    expect((await POST(req('POST', { 'paypercut-signature': 'garbage' }, payment))).status).toBe(401);
    expect((await POST(req('POST', { 'paypercut-signature': sign(payment, undefined, 'wrong-secret').header }, payment))).status).toBe(401);
    expect((await POST(req('POST', { 'paypercut-signature': sign(payment + 'x').header }, payment))).status).toBe(401);
  });

  it('returns 400 for a verified body that is not an event', async () => {
    for (const body of ['not json', '{"data":{}}', '[]']) {
      const res = await POST(req('POST', { 'paypercut-signature': sign(body).header }, body));
      expect(res.status).toBe(400);
    }
  });

  it('dedupes on Paypercut-Delivery-Id', async () => {
    const send = () =>
      POST(req('POST', { 'paypercut-delivery-id': 'del_dedupe_1', 'paypercut-signature': sign(payment).header }, payment));
    expect((await (await send()).json()).duplicate).toBeUndefined();
    expect((await (await send()).json()).duplicate).toBe(true);
  });

  it('rejects an old timestamp only when a tolerance is configured', async () => {
    const old = sign(payment, String(Math.floor(Date.now() / 1000) - 3600)).header;
    expect((await POST(req('POST', { 'paypercut-signature': old }, payment))).status).toBe(200);
    process.env.PAYPERCUT_WEBHOOK_TOLERANCE_SECONDS = '300';
    expect((await POST(req('POST', { 'paypercut-signature': old }, payment))).status).toBe(401);
  });

  it('fails closed with 500 when the secret is not set', async () => {
    delete process.env.PAYPERCUT_WEBHOOK_SECRET;
    const res = await POST(req('POST', { 'paypercut-signature': sign(payment).header }, payment));
    expect(res.status).toBe(500);
  });
});

describe('other HTTP methods', () => {
  it('verifies a bodyless GET over zero bytes and acknowledges it', async () => {
    const res = await GET(req('GET', { 'paypercut-signature': sign('').header }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('rejects an unsigned GET', async () => {
    expect((await GET(req('GET'))).status).toBe(401);
  });

  it('accepts a signed PUT and PATCH with a body', async () => {
    for (const handler of [PUT, PATCH]) {
      const res = await handler(req('PUT', { 'paypercut-signature': sign(payment).header }, payment));
      expect(res.status).toBe(200);
    }
  });

  it('accepts a signed bodyless DELETE', async () => {
    const res = await DELETE(req('DELETE', { 'paypercut-signature': sign('').header }));
    expect(res.status).toBe(200);
  });
});
