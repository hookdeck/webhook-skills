import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/mux/route';

// Mux signing secrets are opaque strings used as-is as the HMAC key
const WEBHOOK_SECRET = 'test_mux_signing_secret';

beforeAll(() => {
  process.env.MUX_WEBHOOK_SECRET = WEBHOOK_SECRET;
});

/**
 * Generate a valid mux-signature header:
 * t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">
 */
function generateMuxSignature(
  payload: string,
  secret: string,
  timestamp = Math.floor(Date.now() / 1000)
): string {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

function eventPayload(type: string, dataId = 'asset_test_123'): string {
  return JSON.stringify({
    type,
    id: '3a56ac3d-33da-4366-855b-f592d898409d',
    object: { type: type.split('.')[1], id: dataId },
    environment: { name: 'Test', id: 'j0863n' },
    data: { id: dataId, status: 'ready', playback_ids: [{ id: 'pb_123', policy: 'public' }] },
    created_at: '2026-10-20T12:00:00.000Z',
    accessor_source: null,
    accessor: null,
    request_id: null,
  });
}

function makeRequest(payload: string, signature?: string): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature) headers['mux-signature'] = signature;
  return new Request('http://localhost/webhooks/mux', {
    method: 'POST',
    headers,
    body: payload,
  }) as unknown as NextRequest;
}

describe('Mux webhook route', () => {
  it('returns 400 when the mux-signature header is missing', async () => {
    const res = await POST(makeRequest(eventPayload('video.asset.ready')));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const res = await POST(makeRequest(eventPayload('video.asset.ready'), `t=${timestamp},v1=deadbeef`));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Webhook Error');
  });

  it('returns 400 for a malformed header', async () => {
    const res = await POST(makeRequest(eventPayload('video.asset.ready'), 'not-a-valid-header'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a signature made with the wrong secret', async () => {
    const payload = eventPayload('video.asset.ready');
    const res = await POST(makeRequest(payload, generateMuxSignature(payload, 'wrong_secret')));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a tampered payload', async () => {
    const signature = generateMuxSignature(eventPayload('video.asset.ready'), WEBHOOK_SECRET);
    const res = await POST(makeRequest(eventPayload('video.asset.ready', 'asset_tampered'), signature));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a timestamp older than 5 minutes', async () => {
    const payload = eventPayload('video.asset.ready');
    const oldTimestamp = Math.floor(Date.now() / 1000) - 400;
    const res = await POST(makeRequest(payload, generateMuxSignature(payload, WEBHOOK_SECRET, oldTimestamp)));
    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid signature', async () => {
    const payload = eventPayload('video.asset.ready');
    const res = await POST(makeRequest(payload, generateMuxSignature(payload, WEBHOOK_SECRET)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts a header with multiple signatures if one matches', async () => {
    const payload = eventPayload('video.asset.ready');
    const valid = generateMuxSignature(payload, WEBHOOK_SECRET);
    const res = await POST(makeRequest(payload, `${valid},v1=${'0'.repeat(64)}`));
    expect(res.status).toBe(200);
  });

  it('handles all supported and unknown event types', async () => {
    const eventTypes = [
      'video.asset.created',
      'video.asset.ready',
      'video.asset.errored',
      'video.asset.deleted',
      'video.asset.live_stream_completed',
      'video.upload.asset_created',
      'video.live_stream.active',
      'video.live_stream.idle',
      'video.asset.track.ready',
    ];

    for (const eventType of eventTypes) {
      const payload = eventPayload(eventType);
      const res = await POST(makeRequest(payload, generateMuxSignature(payload, WEBHOOK_SECRET)));
      expect(res.status).toBe(200);
    }
  });
});
