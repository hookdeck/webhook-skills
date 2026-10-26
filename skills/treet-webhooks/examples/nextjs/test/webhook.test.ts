import crypto from 'crypto';
import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE, GET, PATCH, POST, PUT } from '../app/webhooks/treet/route';
import { verifyTreetSignature } from '../lib/verify-treet';

// Treet issues the secret; it is used as UTF-8 bytes, not decoded.
const SECRET = 'treet_test_secret_key';
const URL = 'http://localhost:3000/webhooks/treet';

// base64(HMAC-SHA256(secret, raw body)), the whole header value
function sign(body: string | Buffer, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('base64');
}

// Payload as shown in Treet's docs (shipping label payload)
const labelUpdated = {
  topic: 'label',
  trigger: 'label/updated',
  shopId: 'boyish',
  bundleId: '12345678-1234-1234-1234-123456789105',
  bundleType: 'TRADE_IN',
  carrier: 'USPS',
  trackingNumber: '28735625627856237856287',
  status: 'SHIPPED',
  updatedAt: '2024-01-01T12:00:00+00:00',
  items: [{ id: '11345678-1234-1234-1234-123456789101', sku: 'large-pink-shirt', title: 'Large Pink Shirt' }],
};
const BODY = JSON.stringify(labelUpdated);

function req(method: string, headers: Record<string, string> = {}, body?: string): NextRequest {
  return new NextRequest(URL, { method, headers, body });
}

const json = { 'content-type': 'application/json' };

beforeEach(() => {
  process.env.TREET_WEBHOOK_SECRET = SECRET;
});

describe('verifyTreetSignature', () => {
  it('accepts a valid signature and verifies the exact bytes', () => {
    expect(verifyTreetSignature(Buffer.from(BODY), sign(BODY))).toBe(true);
    const body = Buffer.from('{ "title": "Café" }\n', 'utf8');
    expect(verifyTreetSignature(body, sign(body))).toBe(true);
    expect(verifyTreetSignature(Buffer.from('{"title":"Café"}'), sign(body))).toBe(false);
  });

  it('rejects a wrong secret, tampered body, missing and malformed signatures', () => {
    expect(verifyTreetSignature(Buffer.from(BODY), sign(BODY, 'other'))).toBe(false);
    expect(verifyTreetSignature(Buffer.from(BODY + ' '), sign(BODY))).toBe(false);
    expect(verifyTreetSignature(Buffer.from(BODY), null)).toBe(false);
    expect(verifyTreetSignature(Buffer.from(BODY), '')).toBe(false);
    expect(verifyTreetSignature(Buffer.from(BODY), 'sha256=' + sign(BODY))).toBe(false);
    expect(verifyTreetSignature(Buffer.from(BODY), sign(BODY).slice(0, -1))).toBe(false);
  });

  it('rejects a base64 value whose last character carries stray bits', () => {
    const sig = sign(BODY);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const tweaked = sig.slice(0, 42) + alphabet[(alphabet.indexOf(sig[42]) + 1) % 64] + '=';
    expect(Buffer.from(tweaked, 'base64').equals(Buffer.from(sig, 'base64'))).toBe(true);
    expect(verifyTreetSignature(Buffer.from(BODY), tweaked)).toBe(false);
  });

  it('never accepts when the secret is unset', () => {
    expect(verifyTreetSignature(Buffer.from(BODY), sign(BODY, ''), '')).toBe(false);
  });
});

describe('POST /webhooks/treet', () => {
  it('accepts label/updated, label/created and unknown triggers', async () => {
    for (const body of [
      BODY,
      JSON.stringify({ ...labelUpdated, trigger: 'label/created' }),
      JSON.stringify({ topic: 'label', trigger: 'label/other' }),
    ]) {
      const res = await POST(req('POST', { ...json, 'x-treet-signature': sign(body) }, body));
      expect(res.status).toBe(200);
    }
  });

  it('accepts any content type', async () => {
    const res = await POST(req('POST', { 'content-type': 'text/plain', 'x-treet-signature': sign(BODY) }, BODY));
    expect(res.status).toBe(200);
  });

  it('rejects a missing, malformed or wrong signature with 401', async () => {
    expect((await POST(req('POST', json, BODY))).status).toBe(401);
    expect((await POST(req('POST', { ...json, 'x-treet-signature': '' }, BODY))).status).toBe(401);
    expect((await POST(req('POST', { ...json, 'x-treet-signature': 'nope' }, BODY))).status).toBe(401);
    expect((await POST(req('POST', { ...json, 'x-treet-signature': sign(BODY, 'other') }, BODY))).status).toBe(401);
  });

  it('returns 400 for a validly signed non-JSON or non-object body', async () => {
    for (const body of ['not json', '[1]']) {
      const res = await POST(req('POST', { ...json, 'x-treet-signature': sign(body) }, body));
      expect(res.status).toBe(400);
    }
  });

  it('tolerates wrong-typed fields', async () => {
    const body = JSON.stringify({ trigger: { x: 1 }, items: 'nope', bundleId: 5 });
    const res = await POST(req('POST', { ...json, 'x-treet-signature': sign(body) }, body));
    expect(res.status).toBe(200);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.TREET_WEBHOOK_SECRET;
    expect((await POST(req('POST', json, BODY))).status).toBe(500);
  });
});

describe('other methods', () => {
  it('verifies a body-less GET over zero bytes and acknowledges it', async () => {
    expect((await GET(req('GET', { 'x-treet-signature': sign('') }))).status).toBe(200);
    expect((await GET(req('GET'))).status).toBe(401);
  });

  it('accepts a signed PUT, PATCH and DELETE with a body', async () => {
    for (const handler of [PUT, PATCH, DELETE]) {
      const method = handler === PUT ? 'PUT' : handler === PATCH ? 'PATCH' : 'DELETE';
      const res = await handler(req(method, { ...json, 'x-treet-signature': sign(BODY) }, BODY));
      expect(res.status).toBe(200);
    }
  });
});
