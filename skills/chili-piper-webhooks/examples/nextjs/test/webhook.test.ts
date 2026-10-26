import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { isTimestampFresh, verifyChiliPiperSignature } from '../lib/verify-chili-piper';
import { POST } from '../app/webhooks/chili-piper/route';

// The secret is issued by Chili Piper support and used as plain UTF-8 bytes
const SECRET = 'test_chili_piper_secret';

// Fixed vector (made up for this skill, computed with openssl)
const VECTOR_TIMESTAMP = '1742589000';
const VECTOR_BODY = '{"meetingIdChili":"123e4567-e89b-12d3-a456-426614174000","type":"Created"}';
const VECTOR_SIGNATURE = '6a44e57295b1df93c32af22231c457052e8ae688ac1856f7320f39a7b2fb67bf';

beforeEach(() => {
  process.env.CHILI_PIPER_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.CHILI_PIPER_WEBHOOK_TOLERANCE_SECONDS;
});

// Sign like Chili Piper: hex(HMAC-SHA256(secret, `${timestamp}.${body}`))
function sign(body: string, timestamp: string, secret = SECRET): string {
  return crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(timestamp), Buffer.from('.'), Buffer.from(body)]))
    .digest('hex');
}

function nowTs(): string {
  return String(Math.floor(Date.now() / 1000));
}

function makeRequest(body: string, headers: Record<string, string> = {}, contentType = 'application/json'): NextRequest {
  return new Request('http://localhost/webhooks/chili-piper', {
    method: 'POST',
    headers: { 'Content-Type': contentType, ...headers },
    body,
  }) as unknown as NextRequest;
}

function meeting(type: string): string {
  return JSON.stringify({
    meetingIdChili: '123e4567-e89b-12d3-a456-426614174000',
    meetingTitle: 'Demo Meeting',
    meetingStartTime: '2025-03-21T20:30:00Z',
    assigneeEmail: 'support@example.com',
    type,
  });
}

describe('verifyChiliPiperSignature', () => {
  it('matches the fixed test vector', () => {
    expect(sign(VECTOR_BODY, VECTOR_TIMESTAMP)).toBe(VECTOR_SIGNATURE);
    expect(
      verifyChiliPiperSignature(Buffer.from(VECTOR_BODY), VECTOR_SIGNATURE, VECTOR_TIMESTAMP, SECRET)
    ).toBe(true);
  });

  it('accepts an uppercase hex digest', () => {
    expect(
      verifyChiliPiperSignature(Buffer.from(VECTOR_BODY), VECTOR_SIGNATURE.toUpperCase(), VECTOR_TIMESTAMP, SECRET)
    ).toBe(true);
  });

  it('rejects a different timestamp, body or secret', () => {
    const body = Buffer.from(VECTOR_BODY);
    expect(verifyChiliPiperSignature(body, VECTOR_SIGNATURE, '1742589001', SECRET)).toBe(false);
    expect(verifyChiliPiperSignature(Buffer.from(VECTOR_BODY + ' '), VECTOR_SIGNATURE, VECTOR_TIMESTAMP, SECRET)).toBe(false);
    expect(verifyChiliPiperSignature(body, VECTOR_SIGNATURE, VECTOR_TIMESTAMP, 'other')).toBe(false);
  });

  it('rejects missing or malformed values', () => {
    const body = Buffer.from(VECTOR_BODY);
    expect(verifyChiliPiperSignature(body, null, VECTOR_TIMESTAMP, SECRET)).toBe(false);
    expect(verifyChiliPiperSignature(body, '', VECTOR_TIMESTAMP, SECRET)).toBe(false);
    expect(verifyChiliPiperSignature(body, VECTOR_SIGNATURE, null, SECRET)).toBe(false);
    expect(verifyChiliPiperSignature(body, VECTOR_SIGNATURE, '', SECRET)).toBe(false);
    expect(verifyChiliPiperSignature(body, 'abc', VECTOR_TIMESTAMP, SECRET)).toBe(false);
    expect(verifyChiliPiperSignature(body, 'sha256=' + VECTOR_SIGNATURE, VECTOR_TIMESTAMP, SECRET)).toBe(false);
    expect(verifyChiliPiperSignature(body, VECTOR_SIGNATURE.slice(0, 63) + 'g', VECTOR_TIMESTAMP, SECRET)).toBe(false);
  });
});

describe('isTimestampFresh', () => {
  const now = 1742589000 * 1000;

  it('is off when tolerance is 0', () => {
    expect(isTimestampFresh('1', 0, now)).toBe(true);
  });

  it('enforces the window when enabled', () => {
    expect(isTimestampFresh('1742588800', 300, now)).toBe(true);
    expect(isTimestampFresh('1742588000', 300, now)).toBe(false);
    expect(isTimestampFresh('not-a-number', 300, now)).toBe(false);
  });
});

describe('POST /webhooks/chili-piper', () => {
  it.each(['Created', 'Updated', 'Deleted'])('accepts a signed %s event', async (type) => {
    const body = meeting(type);
    const ts = nowTs();
    const res = await POST(makeRequest(body, { 'X-Chili-Signature': sign(body, ts), 'X-Chili-Timestamp': ts }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, type });
  });

  it('verifies the bytes received, whatever the content type', async () => {
    const body = meeting('Created');
    const ts = nowTs();
    const res = await POST(
      makeRequest(body, { 'X-Chili-Signature': sign(body, ts), 'X-Chili-Timestamp': ts }, 'text/plain')
    );
    expect(res.status).toBe(200);
  });

  it('returns 401 when the signature header is missing', async () => {
    const res = await POST(makeRequest(meeting('Created'), { 'X-Chili-Timestamp': nowTs() }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the timestamp header is missing', async () => {
    const body = meeting('Created');
    const res = await POST(makeRequest(body, { 'X-Chili-Signature': sign(body, nowTs()) }));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a malformed signature', async () => {
    const res = await POST(makeRequest(meeting('Created'), { 'X-Chili-Signature': 'zz', 'X-Chili-Timestamp': nowTs() }));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a signature made with another secret', async () => {
    const body = meeting('Created');
    const ts = nowTs();
    const res = await POST(makeRequest(body, { 'X-Chili-Signature': sign(body, ts, 'wrong'), 'X-Chili-Timestamp': ts }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the body was altered', async () => {
    const ts = nowTs();
    const res = await POST(
      makeRequest(meeting('Deleted'), { 'X-Chili-Signature': sign(meeting('Created'), ts), 'X-Chili-Timestamp': ts })
    );
    expect(res.status).toBe(401);
  });

  it('accepts an old timestamp by default (retries and replays)', async () => {
    const body = meeting('Created');
    const res = await POST(
      makeRequest(body, { 'X-Chili-Signature': sign(body, '1000000000'), 'X-Chili-Timestamp': '1000000000' })
    );
    expect(res.status).toBe(200);
  });

  it('rejects an old timestamp when a tolerance is set', async () => {
    process.env.CHILI_PIPER_WEBHOOK_TOLERANCE_SECONDS = '300';
    const body = meeting('Created');
    const res = await POST(
      makeRequest(body, { 'X-Chili-Signature': sign(body, '1000000000'), 'X-Chili-Timestamp': '1000000000' })
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const body = 'not json';
    const ts = nowTs();
    const res = await POST(makeRequest(body, { 'X-Chili-Signature': sign(body, ts), 'X-Chili-Timestamp': ts }));
    expect(res.status).toBe(400);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.CHILI_PIPER_WEBHOOK_SECRET;
    const body = meeting('Created');
    const ts = nowTs();
    const res = await POST(makeRequest(body, { 'X-Chili-Signature': sign(body, ts), 'X-Chili-Timestamp': ts }));
    expect(res.status).toBe(500);
  });

  it('acknowledges unknown event types with 200', async () => {
    const body = meeting('Rescheduled');
    const ts = nowTs();
    const res = await POST(makeRequest(body, { 'X-Chili-Signature': sign(body, ts), 'X-Chili-Timestamp': ts }));
    expect(res.status).toBe(200);
  });
});
