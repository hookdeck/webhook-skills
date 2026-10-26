import crypto from 'node:crypto';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const TEST_SECRET = 'test_ultravox_webhook_secret';
process.env.ULTRAVOX_WEBHOOK_SECRET = TEST_SECRET;

import { POST } from '../app/webhooks/ultravox/route';

// Sign exactly as Ultravox does: hex HMAC-SHA256(secret, body bytes + timestamp string, no separator)
function sign(body: string, timestamp: string, secret = TEST_SECRET): string {
  return crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(body), Buffer.from(timestamp, 'latin1')]))
    .digest('hex');
}

interface Opts {
  timestamp?: string | null;
  signature?: string | null;
}

async function post(body: string, { timestamp = new Date().toISOString(), signature }: Opts = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const sig = signature === undefined ? sign(body, timestamp ?? '') : signature;
  if (sig !== null) headers['x-ultravox-webhook-signature'] = sig;
  if (timestamp !== null) headers['x-ultravox-webhook-timestamp'] = timestamp;
  const req = new NextRequest('http://localhost:3000/webhooks/ultravox', { method: 'POST', headers, body });
  return POST(req);
}

const event = (name: string) => JSON.stringify({ event: name });

describe('Ultravox webhook', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.ULTRAVOX_WEBHOOK_TOLERANCE_SECONDS;
  });

  test.each(['call.started', 'call.joined', 'call.ended', 'call.billed'])(
    'accepts a signed %s event with 204',
    async (name) => {
      expect((await post(event(name))).status).toBe(204);
    }
  );

  test('accepts and logs unknown events', async () => {
    expect((await post(event('call.something_new'))).status).toBe(204);
  });

  test('verifies the exact raw bytes (whitespace preserved)', async () => {
    expect((await post('{ "event" :  "call.ended" }\n')).status).toBe(204);
  });

  test('accepts an uppercase hex signature', async () => {
    const body = event('call.started');
    const ts = new Date().toISOString();
    expect((await post(body, { timestamp: ts, signature: sign(body, ts).toUpperCase() })).status).toBe(204);
  });

  test('rejects a missing signature', async () => {
    expect((await post(event('call.ended'), { signature: null })).status).toBe(401);
  });

  test('rejects an empty signature', async () => {
    expect((await post(event('call.ended'), { signature: '' })).status).toBe(401);
  });

  test('rejects a missing timestamp', async () => {
    expect((await post(event('call.ended'), { timestamp: null, signature: 'a'.repeat(64) })).status).toBe(401);
  });

  test('rejects a wrong signature', async () => {
    expect((await post(event('call.ended'), { signature: 'a'.repeat(64) })).status).toBe(401);
  });

  test('rejects a signature made with another secret', async () => {
    const body = event('call.ended');
    const ts = new Date().toISOString();
    expect((await post(body, { timestamp: ts, signature: sign(body, ts, 'other_secret') })).status).toBe(401);
  });

  test('rejects a tampered body', async () => {
    const ts = new Date().toISOString();
    const signature = sign(event('call.ended'), ts);
    expect((await post(event('call.billed'), { timestamp: ts, signature })).status).toBe(401);
  });

  test('rejects a tampered timestamp', async () => {
    const body = event('call.ended');
    const signature = sign(body, '2026-01-01T00:00:00.000Z');
    expect((await post(body, { timestamp: '2026-01-01T00:00:01.000Z', signature })).status).toBe(401);
  });

  test('rejects malformed signatures (length, alphabet, prefix, list)', async () => {
    const body = event('call.ended');
    const ts = new Date().toISOString();
    const good = sign(body, ts);
    for (const signature of [good.slice(0, 62), good + '00', 'z'.repeat(64), `sha256=${good}`, `${good},${good}`]) {
      expect((await post(body, { timestamp: ts, signature })).status).toBe(401);
    }
  });

  test('does not reject old timestamps by default (retries and replays)', async () => {
    expect((await post(event('call.ended'), { timestamp: '2020-01-01T00:00:00.000Z' })).status).toBe(204);
  });

  test('rejects old timestamps when the tolerance is enabled', async () => {
    process.env.ULTRAVOX_WEBHOOK_TOLERANCE_SECONDS = '60';
    expect((await post(event('call.ended'), { timestamp: '2020-01-01T00:00:00.000Z' })).status).toBe(401);
    expect((await post(event('call.ended'))).status).toBe(204);
  });

  test('returns 400 for a signed body that is not JSON', async () => {
    expect((await post('not json')).status).toBe(400);
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.ULTRAVOX_WEBHOOK_SECRET;
    const res = await post(event('call.ended'));
    process.env.ULTRAVOX_WEBHOOK_SECRET = TEST_SECRET;
    expect(res.status).toBe(500);
  });
});
