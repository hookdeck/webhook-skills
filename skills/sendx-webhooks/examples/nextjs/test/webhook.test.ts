import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/sendx/route';
import { verifySendxSignature, getEventType } from '../lib/sendx';

// SendX signs with the team API key (any string, used as UTF-8 bytes as-is)
const SECRET = 'sendx_team_api_key_for_tests';

function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/webhooks/sendx', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

const body = JSON.stringify({ type: 7, email: 'jane@example.com' });

describe('SendX webhook', () => {
  beforeEach(() => {
    process.env.SENDX_WEBHOOK_SECRET = SECRET;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('accepts a valid signature', async () => {
    const res = await POST(makeRequest(body, { 'x-sendx-signature': sign(body), 'x-sendx-signature-alg': 'hmac-sha256' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('MailOpen (type 7)'));
  });

  it('accepts an uppercase hex signature', async () => {
    expect((await POST(makeRequest(body, { 'x-sendx-signature': sign(body).toUpperCase() }))).status).toBe(200);
  });

  it('verifies any content type over the raw bytes', async () => {
    const req = makeRequest(body, { 'x-sendx-signature': sign(body), 'content-type': 'text/plain' });
    expect((await POST(req)).status).toBe(200);
  });

  it('verifies exact bytes, including odd whitespace', async () => {
    const spaced = '{ "type" : 8 ,\n "email":"a@example.com" }';
    expect((await POST(makeRequest(spaced, { 'x-sendx-signature': sign(spaced) }))).status).toBe(200);
  });

  it('rejects a missing signature', async () => {
    expect((await POST(makeRequest(body))).status).toBe(401);
  });

  it('rejects an empty signature', async () => {
    expect((await POST(makeRequest(body, { 'x-sendx-signature': '' }))).status).toBe(401);
  });

  it('rejects a wrong secret', async () => {
    expect((await POST(makeRequest(body, { 'x-sendx-signature': sign(body, 'other_key') }))).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const res = await POST(makeRequest(body.replace('jane', 'mallory'), { 'x-sendx-signature': sign(body) }));
    expect(res.status).toBe(401);
  });

  it.each([
    ['too short', 'abcd'],
    ['too long', 'a'.repeat(66)],
    ['non-hex characters', 'z'.repeat(64)],
    ['prefixed', `sha256=${'a'.repeat(64)}`],
  ])('rejects a malformed signature (%s)', async (_label, sig) => {
    expect((await POST(makeRequest(body, { 'x-sendx-signature': sig }))).status).toBe(401);
  });

  it('answers 400 for a signed non-JSON body', async () => {
    const bad = 'not json';
    expect((await POST(makeRequest(bad, { 'x-sendx-signature': sign(bad) }))).status).toBe(400);
  });

  it.each(['null', '42', '[1,2]', '"text"'])('answers 400 for a signed non-object body %s', async (raw) => {
    expect((await POST(makeRequest(raw, { 'x-sendx-signature': sign(raw) }))).status).toBe(400);
  });

  it.each([
    ['missing type', { email: 'a@example.com' }],
    ['string type', { type: 'open' }],
    ['object type', { type: { a: 1 } }],
    ['null type', { type: null }],
    ['fractional type', { type: 7.5 }],
  ])('ignores a wrong-typed event (%s) without erroring', async (_label, payload) => {
    const raw = JSON.stringify(payload);
    expect((await POST(makeRequest(raw, { 'x-sendx-signature': sign(raw) }))).status).toBe(200);
  });

  it('answers 500 when the secret is not configured', async () => {
    delete process.env.SENDX_WEBHOOK_SECRET;
    expect((await POST(makeRequest(body, { 'x-sendx-signature': sign(body) }))).status).toBe(500);
  });
});

describe('verifySendxSignature', () => {
  it('takes bytes and compares the whole header value', () => {
    const raw = Buffer.from(body);
    expect(verifySendxSignature(raw, sign(body), SECRET)).toBe(true);
    expect(verifySendxSignature(raw, null, SECRET)).toBe(false);
  });
});

describe('getEventType', () => {
  it('compares event codes as numbers', () => {
    expect(getEventType({ type: 7 })).toBe(7);
    expect(getEventType({ type: '8' })).toBe(8);
    expect(getEventType({ type: 'x' })).toBeNull();
    expect(getEventType(null)).toBeNull();
    expect(getEventType([7])).toBeNull();
  });
});
