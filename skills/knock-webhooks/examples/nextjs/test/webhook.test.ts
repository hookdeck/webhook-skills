import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

beforeAll(() => {
  process.env.KNOCK_WEBHOOK_SECRET = 'test_knock_signing_secret_value';
});

import { POST, verifyKnockSignature } from '../app/webhooks/knock/route';
import { NextRequest } from 'next/server';

const SECRET = 'test_knock_signing_secret_value';

/**
 * Generate a valid x-knock-signature header for testing.
 * Header format: t=<timestamp_ms>,s=<base64_signature>
 * Signed content: `${timestamp_ms}.${raw_body}`
 *
 * Knock's timestamp is in MILLISECONDS, not seconds.
 */
function generateKnockSignature(
  payload: string,
  secret: string,
  timestampMs: number | null = null
): string {
  const ts = timestampMs == null ? Date.now().toString() : String(timestampMs);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${ts}.${payload}`)
    .digest('base64');
  return `t=${ts},s=${signature}`;
}

function buildRequest(payload: string, header: string | null): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (header) headers.set('x-knock-signature', header);
  return new NextRequest('http://localhost/webhooks/knock', {
    method: 'POST',
    headers,
    body: payload,
  });
}

describe('verifyKnockSignature', () => {
  it('accepts a valid signature', () => {
    const payload = JSON.stringify({ id: 'evt_1', type: 'message.sent' });
    const header = generateKnockSignature(payload, SECRET);
    expect(verifyKnockSignature(payload, header, SECRET)).toEqual({ valid: true });
  });

  it('rejects when header is missing', () => {
    expect(verifyKnockSignature('{}', null, SECRET)).toMatchObject({
      valid: false,
      error: expect.stringContaining('Missing'),
    });
  });

  it('rejects a malformed header', () => {
    expect(verifyKnockSignature('{}', 'garbage', SECRET)).toMatchObject({
      valid: false,
      error: expect.stringContaining('Malformed'),
    });
  });

  it('rejects an expired timestamp', () => {
    const payload = JSON.stringify({ id: 'evt_1', type: 'message.sent' });
    const oldTs = Date.now() - 10 * 60 * 1000;
    const header = generateKnockSignature(payload, SECRET, oldTs);
    expect(verifyKnockSignature(payload, header, SECRET)).toMatchObject({
      valid: false,
      error: expect.stringContaining('Timestamp'),
    });
  });

  it('rejects a tampered payload', () => {
    const original = JSON.stringify({ id: 'evt_1', type: 'message.sent' });
    const header = generateKnockSignature(original, SECRET);
    const tampered = JSON.stringify({ id: 'evt_2', type: 'message.sent' });
    expect(verifyKnockSignature(tampered, header, SECRET)).toMatchObject({
      valid: false,
      error: 'Invalid signature',
    });
  });

  it('rejects a Stripe-style seconds-based signature (regression: ms vs s)', () => {
    const payload = JSON.stringify({ id: 'evt_1', type: 'message.sent' });
    const tsSeconds = Math.floor(Date.now() / 1000).toString();
    const sig = crypto
      .createHmac('sha256', SECRET)
      .update(`${tsSeconds}.${payload}`)
      .digest('base64');
    const header = `t=${tsSeconds},s=${sig}`;
    // Seconds-since-epoch parsed as ms-since-epoch lands in ~1970 — outside tolerance.
    expect(verifyKnockSignature(payload, header, SECRET)).toMatchObject({
      valid: false,
      error: expect.stringContaining('Timestamp'),
    });
  });
});

describe('POST /webhooks/knock', () => {
  it('returns 400 when signature header is missing', async () => {
    const res = await POST(buildRequest('{}', null));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Missing');
  });

  it('returns 400 for a tampered payload', async () => {
    const original = JSON.stringify({ id: 'evt_1', type: 'message.sent' });
    const header = generateKnockSignature(original, SECRET);
    const tampered = JSON.stringify({ id: 'evt_x', type: 'message.sent' });
    const res = await POST(buildRequest(tampered, header));
    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid signature', async () => {
    const payload = JSON.stringify({
      id: 'evt_valid',
      type: 'message.delivered',
      data: { id: 'msg_valid' },
    });
    const header = generateKnockSignature(payload, SECRET);
    const res = await POST(buildRequest(payload, header));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ received: true });
  });

  it('handles every documented event type', async () => {
    const eventTypes = [
      'message.sent',
      'message.delivered',
      'message.delivery_attempted',
      'message.undelivered',
      'message.bounced',
      'message.seen',
      'message.unseen',
      'message.read',
      'message.unread',
      'message.archived',
      'message.unarchived',
      'message.interacted',
      'message.link_clicked',
      'workflow.updated',
      'workflow.committed',
      'email_layout.updated',
      'email_layout.committed',
      'translation.updated',
      'translation.committed',
      'source_event_action.updated',
      'source_event_action.committed',
      'partial.updated',
      'partial.committed',
      'unknown.event.type',
    ];

    for (const type of eventTypes) {
      const payload = JSON.stringify({
        id: `evt_${type.replace(/\./g, '_')}`,
        type,
        data: { id: 'res_1', key: 'k', locale_code: 'en' },
        event_data: { url: 'https://example.com' },
      });
      const header = generateKnockSignature(payload, SECRET);
      const res = await POST(buildRequest(payload, header));
      expect(res.status).toBe(200);
    }
  });
});
