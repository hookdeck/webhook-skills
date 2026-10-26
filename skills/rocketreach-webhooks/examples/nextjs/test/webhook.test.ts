import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const TEST_SECRET = 'rocketreach_test_secret';
process.env.ROCKETREACH_WEBHOOK_SECRET = TEST_SECRET;

import { POST } from '../app/webhooks/rocketreach/route';
import { verifyRocketReachSignature } from '../lib/rocketreach';

// Sign exactly like RocketReach: base64(HMAC-SHA256(secret as UTF-8, raw body))
function sign(body: string, secret: string = TEST_SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('base64');
}

function profile(status = 'complete', id = 123456) {
  return {
    profile_list: { id: 1000, name: 'Example Profile List' },
    id,
    status,
    name: 'Ada Lovelace',
    current_title: 'Engineer',
    current_employer: 'Analytical Engines',
    emails: [{ email: 'ada@example.com', smtp_valid: 'valid' }],
  };
}

function buildRequest(body: string, headers: Record<string, string> = {}, contentType = 'application/json') {
  return new NextRequest('http://localhost:3000/webhooks/rocketreach', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('verifyRocketReachSignature', () => {
  const body = JSON.stringify(profile());

  it('accepts a correct base64 HMAC-SHA256 of the raw body', () => {
    expect(verifyRocketReachSignature(body, sign(body), TEST_SECRET)).toBe(true);
  });

  it('rejects missing signature or secret and length mismatches', () => {
    expect(verifyRocketReachSignature(body, undefined, TEST_SECRET)).toBe(false);
    expect(verifyRocketReachSignature(body, sign(body), undefined)).toBe(false);
    expect(verifyRocketReachSignature(body, 'short', TEST_SECRET)).toBe(false);
  });

  it('does not leniently decode the header (hex or trailing junk)', () => {
    const hex = crypto.createHmac('sha256', TEST_SECRET).update(body).digest('hex');
    expect(verifyRocketReachSignature(body, hex, TEST_SECRET)).toBe(false);
    expect(verifyRocketReachSignature(body, sign(body) + '!!', TEST_SECRET)).toBe(false);
  });

  it('returns false for a non-ASCII header without throwing', () => {
    expect(verifyRocketReachSignature(body, 'é'.repeat(22), TEST_SECRET)).toBe(false);
  });
});

describe('POST /webhooks/rocketreach', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    process.env.ROCKETREACH_WEBHOOK_SECRET = TEST_SECRET;
  });

  it('accepts a signed People Lookup result', async () => {
    const body = JSON.stringify(profile());
    const res = await POST(buildRequest(body, { 'x-rocketreach-signature': sign(body), 'rr-request-id': 'abc' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, profiles: 1 });
  });

  it('accepts a signed Bulk People Lookup list', async () => {
    const body = JSON.stringify([profile('complete', 1), profile('complete', 2)]);
    const res = await POST(buildRequest(body, { 'x-rocketreach-signature': sign(body) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, profiles: 2 });
  });

  it('accepts a profile that is not complete yet', async () => {
    const body = JSON.stringify(profile('progress'));
    const res = await POST(buildRequest(body, { 'x-rocketreach-signature': sign(body) }));
    expect(res.status).toBe(200);
  });

  it('verifies any content type (raw body)', async () => {
    const body = JSON.stringify(profile());
    const res = await POST(buildRequest(body, { 'x-rocketreach-signature': sign(body) }, 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature header', async () => {
    const res = await POST(buildRequest(JSON.stringify(profile())));
    expect(res.status).toBe(401);
  });

  it('rejects an invalid signature', async () => {
    const res = await POST(buildRequest(JSON.stringify(profile()), { 'x-rocketreach-signature': sign('other') }));
    expect(res.status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = JSON.stringify(profile());
    const res = await POST(buildRequest(body, { 'x-rocketreach-signature': sign(body, 'wrong_secret') }));
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(profile());
    const res = await POST(buildRequest(body.replace('Ada', 'Eve'), { 'x-rocketreach-signature': sign(body) }));
    expect(res.status).toBe(401);
  });

  it('rejects a validly signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await POST(buildRequest(body, { 'x-rocketreach-signature': sign(body) }, 'text/plain'));
    expect(res.status).toBe(400);
  });

  it('fails closed when the secret is not configured', async () => {
    delete process.env.ROCKETREACH_WEBHOOK_SECRET;
    const body = JSON.stringify(profile());
    const res = await POST(buildRequest(body, { 'x-rocketreach-signature': sign(body) }));
    expect(res.status).toBe(500);
  });
});
