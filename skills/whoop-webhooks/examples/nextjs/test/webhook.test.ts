import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const secret = 'test_client_secret';
process.env.WHOOP_WEBHOOK_SECRET = secret;
delete process.env.WHOOP_WEBHOOK_TOLERANCE_SECONDS;

import { POST, verifyWhoopSignature, isTimestampFresh } from '../app/webhooks/whoop/route';

// Doc example payload (sleep.updated)
const sleepPayload = {
  user_id: 456,
  id: '550e8400-e29b-41d4-a716-446655440000',
  type: 'sleep.updated',
  trace_id: 'e369c784-5100-49e8-8098-75d35c47b31b',
};
const body = JSON.stringify(sleepPayload);

/** base64(HMAC-SHA256(secret, timestamp + rawBody)), no separator */
function sign(rawBody: string, timestamp: string, key = secret): string {
  return crypto
    .createHmac('sha256', key)
    .update(Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from(rawBody)]))
    .digest('base64');
}

function makeRequest(
  rawBody: string,
  opts: { timestamp?: string | null; signature?: string | null } = {}
): NextRequest {
  const timestamp = opts.timestamp === undefined ? String(Date.now()) : opts.timestamp;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const signature = opts.signature === undefined ? sign(rawBody, timestamp ?? '') : opts.signature;
  if (signature !== null) headers['x-whoop-signature'] = signature;
  if (timestamp !== null) headers['x-whoop-signature-timestamp'] = timestamp;
  return new NextRequest('http://localhost:3000/webhooks/whoop', {
    method: 'POST',
    headers,
    body: rawBody,
  });
}

describe('verifyWhoopSignature', () => {
  const ts = '1700000000000';
  const raw = Buffer.from(body);

  it('accepts a valid signature', () => {
    expect(verifyWhoopSignature(raw, sign(body, ts), ts, secret)).toBe(true);
  });

  it('rejects another secret, timestamp or body', () => {
    expect(verifyWhoopSignature(raw, sign(body, ts, 'other'), ts, secret)).toBe(false);
    expect(verifyWhoopSignature(raw, sign(body, ts), '1700000000001', secret)).toBe(false);
    expect(verifyWhoopSignature(Buffer.from('{}'), sign(body, ts), ts, secret)).toBe(false);
  });

  it('rejects missing values', () => {
    const sig = sign(body, ts);
    expect(verifyWhoopSignature(raw, null, ts, secret)).toBe(false);
    expect(verifyWhoopSignature(raw, '', ts, secret)).toBe(false);
    expect(verifyWhoopSignature(raw, sig, null, secret)).toBe(false);
    expect(verifyWhoopSignature(raw, sig, ts, undefined)).toBe(false);
  });

  it('rejects malformed signatures without throwing', () => {
    const sig = sign(body, ts);
    expect(verifyWhoopSignature(raw, sig.slice(0, -1), ts, secret)).toBe(false);
    expect(verifyWhoopSignature(raw, sig.replace(/=$/, ''), ts, secret)).toBe(false);
    expect(verifyWhoopSignature(raw, sig.slice(0, 43) + '!', ts, secret)).toBe(false);
    expect(verifyWhoopSignature(raw, sig + sig, ts, secret)).toBe(false);
    expect(verifyWhoopSignature(raw, 'sha256=' + sig, ts, secret)).toBe(false);
    expect(verifyWhoopSignature(raw, sig.toLowerCase(), ts, secret)).toBe(false);
  });
});

describe('isTimestampFresh', () => {
  const now = 1700000000000;

  it('is off by default', () => {
    expect(isTimestampFresh('1', undefined, now)).toBe(true);
    expect(isTimestampFresh('1', 0, now)).toBe(true);
    expect(isTimestampFresh('1', NaN, now)).toBe(true);
  });

  it('uses milliseconds when enabled', () => {
    expect(isTimestampFresh(String(now - 299000), 300, now)).toBe(true);
    expect(isTimestampFresh(String(now - 301000), 300, now)).toBe(false);
    expect(isTimestampFresh('not-a-number', 300, now)).toBe(false);
  });
});

describe('POST /webhooks/whoop', () => {
  it('returns 200 for a valid webhook', async () => {
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies bodies that would not survive re-serialization', async () => {
    const raw = '{ "user_id": 456,  "id": "550e8400-e29b-41d4-a716-446655440000", "type": "sleep.updated", "note": "héllo" }';
    const res = await POST(makeRequest(raw));
    expect(res.status).toBe(200);
  });

  it('accepts old timestamps by default (retries and replays)', async () => {
    const res = await POST(makeRequest(body, { timestamp: '1700000000000' }));
    expect(res.status).toBe(200);
  });

  it('returns 401 for an invalid signature', async () => {
    const res = await POST(makeRequest(body, { signature: 'A'.repeat(43) + '=' }));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a malformed signature', async () => {
    const res = await POST(makeRequest(body, { signature: 'not-base64' }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the signature header is missing', async () => {
    const res = await POST(makeRequest(body, { signature: null }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the timestamp header is missing', async () => {
    const res = await POST(makeRequest(body, { timestamp: null, signature: sign(body, '') }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const res = await POST(makeRequest('not json'));
    expect(res.status).toBe(400);
  });

  it.each([
    'sleep.updated', 'sleep.deleted', 'workout.updated', 'workout.deleted',
    'recovery.updated', 'recovery.deleted', 'something.new',
  ])('acknowledges %s', async (type) => {
    const res = await POST(makeRequest(JSON.stringify({ ...sleepPayload, type })));
    expect(res.status).toBe(200);
  });

  describe('with a tolerance configured', () => {
    beforeAll(() => { process.env.WHOOP_WEBHOOK_TOLERANCE_SECONDS = '300'; });
    afterAll(() => { delete process.env.WHOOP_WEBHOOK_TOLERANCE_SECONDS; });

    it('accepts a fresh timestamp', async () => {
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(200);
    });

    it('rejects a stale timestamp even when correctly signed', async () => {
      const res = await POST(makeRequest(body, { timestamp: String(Date.now() - 3600 * 1000) }));
      expect(res.status).toBe(401);
    });
  });
});
