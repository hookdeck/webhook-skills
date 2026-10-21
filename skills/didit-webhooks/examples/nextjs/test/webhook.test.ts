// Generated with: didit-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/didit/route';
import { verifyDiditSignature, toleranceFromEnv } from '../lib/didit';

// Didit's secret_shared_key is used as a raw string (not decoded).
const SECRET = 'didit_test_secret_shared_key_1234567890';

// Didit serialises with sorted keys and compact separators; X-Signature is the
// hex HMAC-SHA256 of those exact bytes. X-Timestamp is sent separately.
function sign(body: string, secret: string = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

// Keys already sorted, as Didit sends them.
function sessionEvent(webhookType: string, status: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    application_id: '11111111-2222-3333-4444-555555555555',
    created_at: nowSeconds() - 5,
    environment: 'live',
    event_id: '9c0c8b8a-1111-4222-9333-444444444444',
    session_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    status,
    timestamp: nowSeconds(),
    vendor_data: 'user_42',
    webhook_type: webhookType,
    ...extra,
  });
}

function makeRequest(
  body: string,
  opts: { signature?: string | null; timestamp?: string | null } = {}
): NextRequest {
  const signature = opts.signature === undefined ? sign(body) : opts.signature;
  const timestamp = opts.timestamp === undefined ? String(nowSeconds()) : opts.timestamp;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature !== null) headers['x-signature'] = signature;
  if (timestamp !== null) headers['x-timestamp'] = timestamp;
  return new NextRequest('http://localhost:3000/webhooks/didit', { method: 'POST', headers, body });
}

describe('verifyDiditSignature', () => {
  const body = sessionEvent('status.updated', 'Approved');
  const now = nowSeconds();

  test('accepts a valid signature and fresh timestamp', () => {
    expect(verifyDiditSignature(body, sign(body), String(now), SECRET, 300, now).valid).toBe(true);
  });

  test('rejects a wrong secret', () => {
    expect(verifyDiditSignature(body, sign(body, 'other'), String(now), SECRET, 300, now).valid).toBe(false);
  });

  test('rejects a modified body', () => {
    expect(verifyDiditSignature(body + ' ', sign(body), String(now), SECRET, 300, now).valid).toBe(false);
  });

  test('rejects a signature of the wrong length without throwing', () => {
    expect(verifyDiditSignature(body, 'abc', String(now), SECRET, 300, now).valid).toBe(false);
  });

  test('rejects a stale timestamp', () => {
    const r = verifyDiditSignature(body, sign(body), String(now - 301), SECRET, 300, now);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/tolerance/i);
  });

  test('rejects a future timestamp outside the window', () => {
    expect(verifyDiditSignature(body, sign(body), String(now + 301), SECRET, 300, now).valid).toBe(false);
  });

  test('accepts a timestamp at the edge of the window', () => {
    expect(verifyDiditSignature(body, sign(body), String(now - 300), SECRET, 300, now).valid).toBe(true);
  });

  test('rejects a missing timestamp when tolerance is enabled', () => {
    expect(verifyDiditSignature(body, sign(body), null, SECRET, 300, now).valid).toBe(false);
  });

  test('skips the timestamp check when tolerance is 0', () => {
    expect(verifyDiditSignature(body, sign(body), String(now - 99999), SECRET, 0, now).valid).toBe(true);
  });

  test('rejects a missing signature', () => {
    expect(verifyDiditSignature(body, null, String(now), SECRET, 300, now).valid).toBe(false);
  });
});

describe('toleranceFromEnv', () => {
  test('defaults to 0 (check off)', () => expect(toleranceFromEnv({})).toBe(0));
  test('reads a configured value', () => {
    expect(toleranceFromEnv({ DIDIT_TIMESTAMP_TOLERANCE_SECONDS: '60' })).toBe(60);
  });
  test('treats garbage as 0 (check off), with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(toleranceFromEnv({ DIDIT_TIMESTAMP_TOLERANCE_SECONDS: 'abc' })).toBe(0);
    expect(toleranceFromEnv({ DIDIT_TIMESTAMP_TOLERANCE_SECONDS: '5min' })).toBe(0);
    warn.mockRestore();
  });
});

describe('POST /webhooks/didit', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.DIDIT_WEBHOOK_SECRET = SECRET;
    delete process.env.DIDIT_TIMESTAMP_TOLERANCE_SECONDS;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('accepts a signed status.updated event', async () => {
    const res = await POST(makeRequest(sessionEvent('status.updated', 'Approved')));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('is now Approved'));
  });

  test('accepts a signed data.updated event', async () => {
    const res = await POST(makeRequest(sessionEvent('data.updated', 'Approved', { trigger: 'manual_review' })));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('data updated'));
  });

  test('acknowledges event types it does not handle', async () => {
    const res = await POST(makeRequest(sessionEvent('user.status.updated', 'BLOCKED')));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Unhandled Didit event: user.status.updated');
  });

  test('verifies the exact raw bytes, including non-ASCII escapes', async () => {
    // Didit's X-Signature covers ensure_ascii=True output, i.e. é stays escaped.
    const body = sessionEvent('status.updated', 'Approved', { vendor_data: 'Jos\\u00e9' });
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);
  });

  test('rejects an invalid signature', async () => {
    const body = sessionEvent('status.updated', 'Approved');
    const res = await POST(makeRequest(body, { signature: sign(body, 'wrong_secret') }));
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const body = sessionEvent('status.updated', 'Declined');
    const res = await POST(makeRequest(body.replace('Declined', 'Approved'), { signature: sign(body) }));
    expect(res.status).toBe(400);
  });

  test('rejects a missing X-Signature header', async () => {
    const res = await POST(makeRequest(sessionEvent('status.updated', 'Approved'), { signature: null }));
    expect(res.status).toBe(400);
  });

  test('accepts an old X-Timestamp by default (Hookdeck retries and replays keep it)', async () => {
    const res = await POST(
      makeRequest(sessionEvent('status.updated', 'Approved'), { timestamp: String(nowSeconds() - 86400) })
    );
    expect(res.status).toBe(200);
  });

  test('rejects a stale X-Timestamp when DIDIT_TIMESTAMP_TOLERANCE_SECONDS is set', async () => {
    process.env.DIDIT_TIMESTAMP_TOLERANCE_SECONDS = '300';
    try {
      const res = await POST(
        makeRequest(sessionEvent('status.updated', 'Approved'), { timestamp: String(nowSeconds() - 600) })
      );
      expect(res.status).toBe(400);
    } finally {
      delete process.env.DIDIT_TIMESTAMP_TOLERANCE_SECONDS;
    }
  });

  test('returns 400 for a signed but non-JSON body', async () => {
    const res = await POST(makeRequest('not json'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid JSON');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.DIDIT_WEBHOOK_SECRET;
    const res = await POST(makeRequest(sessionEvent('status.updated', 'Approved')));
    expect(res.status).toBe(500);
  });
});
