import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/basin/route';
import { verifyBasinSignature } from '../lib/basin';

const SECRET = 'basin_test_signing_secret';

function sign(body: string, secret = SECRET) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function makeRequest(body: string, headers: Record<string, string>) {
  return new NextRequest('http://localhost:3000/webhooks/basin', {
    method: 'POST',
    headers,
    body,
  });
}

const json = JSON.stringify({ id: 'sub_123', email: 'a@example.com', name: 'Ann' });
const wrapped = JSON.stringify({ data: { id: 'sub_124', email: 'b@example.com' } });
const form = 'id=sub_125&email=c%40example.com&name=Cy+Dee';

beforeAll(() => {
  process.env.BASIN_WEBHOOK_SECRET = SECRET;
});

describe('verifyBasinSignature', () => {
  it('accepts a valid signature', () => {
    expect(verifyBasinSignature(json, sign(json), SECRET)).toBe(true);
  });
  it('rejects wrong secret, missing prefix, missing header, bad hex, wrong length', () => {
    expect(verifyBasinSignature(json, sign(json, 'other'), SECRET)).toBe(false);
    expect(verifyBasinSignature(json, sign(json).slice(7), SECRET)).toBe(false);
    expect(verifyBasinSignature(json, null, SECRET)).toBe(false);
    expect(verifyBasinSignature(json, 'sha256=' + 'zz'.repeat(32), SECRET)).toBe(false);
    expect(verifyBasinSignature(json, 'sha256=abcd', SECRET)).toBe(false);
  });
});

describe('POST /webhooks/basin', () => {
  it.each([
    ['JSON', json, 'application/json'],
    ['data wrapped JSON', wrapped, 'application/json'],
    ['form-urlencoded', form, 'application/x-www-form-urlencoded'],
  ])('accepts a signed %s submission', async (_n, body, type) => {
    const res = await POST(makeRequest(body, { 'content-type': type, 'x-basin-signature': sign(body) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('rejects an unsigned request', async () => {
    const res = await POST(makeRequest(json, { 'content-type': 'application/json' }));
    expect(res.status).toBe(400);
  });

  it('rejects a bad signature', async () => {
    const res = await POST(
      makeRequest(json, { 'content-type': 'application/json', 'x-basin-signature': sign(json, 'wrong') })
    );
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const res = await POST(
      makeRequest(json.replace('Ann', 'Eve'), { 'content-type': 'application/json', 'x-basin-signature': sign(json) })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for a signed but malformed JSON body', async () => {
    const bad = '{not json';
    const res = await POST(makeRequest(bad, { 'content-type': 'application/json', 'x-basin-signature': sign(bad) }));
    expect(res.status).toBe(400);
  });
});
