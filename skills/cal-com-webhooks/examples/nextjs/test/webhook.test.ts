import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST, verifyCalComWebhook } from '../app/webhooks/cal-com/route';

// Cal.com secrets are free-form strings chosen by the user.
const secret = 'test_calcom_webhook_secret';

beforeEach(() => {
  process.env.CALCOM_WEBHOOK_SECRET = secret;
});

/** Generate a Cal.com signature: hex(HMAC-SHA256(secret, rawBody)), no prefix. */
function sign(payload: string, key = secret): string {
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

function bookingEvent(triggerEvent: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    triggerEvent,
    createdAt: '2024-01-01T00:00:00.000Z',
    payload: {
      uid: 'unique-booking-id',
      bookingId: 100,
      title: 'Strategy Session between Organizer and Guest',
      startTime: '2024-01-01T10:00:00Z',
      endTime: '2024-01-01T10:15:00Z',
      organizer: { name: 'Organizer Name', email: 'organizer@example.com' },
      attendees: [{ name: 'Guest User', email: 'guest@example.com' }],
      ...extra,
    },
  });
}

function makeRequest(body: string, signature?: string): NextRequest {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Cal-Webhook-Version': '2021-10-20',
  };
  if (signature !== undefined) headers['X-Cal-Signature-256'] = signature;
  return new NextRequest('http://localhost/webhooks/cal-com', {
    method: 'POST',
    headers,
    body,
  });
}

describe('verifyCalComWebhook', () => {
  const body = bookingEvent('BOOKING_CREATED');

  it('accepts a valid signature', () => {
    expect(verifyCalComWebhook(body, sign(body), secret)).toBe(true);
  });

  it('rejects a signature made with the wrong secret', () => {
    expect(verifyCalComWebhook(body, sign(body, 'wrong'), secret)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const tampered = body.replace('Guest User', 'Mallory');
    expect(verifyCalComWebhook(tampered, sign(body), secret)).toBe(false);
  });

  it('rejects a sha256= prefixed value', () => {
    expect(verifyCalComWebhook(body, `sha256=${sign(body)}`, secret)).toBe(false);
  });

  it('rejects "no-secret-provided" and missing values', () => {
    expect(verifyCalComWebhook(body, 'no-secret-provided', secret)).toBe(false);
    expect(verifyCalComWebhook(body, null, secret)).toBe(false);
    expect(verifyCalComWebhook(body, sign(body), undefined)).toBe(false);
  });
});

describe('POST /webhooks/cal-com', () => {
  it('returns 400 when the signature header is missing', async () => {
    const res = await POST(makeRequest(bookingEvent('BOOKING_CREATED')));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing signature header' });
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await POST(makeRequest(bookingEvent('BOOKING_CREATED'), 'a'.repeat(64)));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid signature' });
  });

  it('returns 400 for an unsigned webhook (no-secret-provided)', async () => {
    const res = await POST(makeRequest(bookingEvent('BOOKING_CREATED'), 'no-secret-provided'));
    expect(res.status).toBe(400);
  });

  it.each([
    ['BOOKING_CREATED', {}],
    ['BOOKING_RESCHEDULED', { rescheduleUid: 'previous-booking-id' }],
    ['BOOKING_CANCELLED', { cancellationReason: 'Conflict' }],
    ['BOOKING_PAID', { paymentId: 500 }],
    ['SOME_FUTURE_EVENT', {}],
  ])('returns 200 for a signed %s event', async (trigger, extra) => {
    const body = bookingEvent(trigger, extra);
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('handles the flat MEETING_ENDED payload', async () => {
    const body = JSON.stringify({
      triggerEvent: 'MEETING_ENDED',
      id: 100,
      uid: 'unique-booking-identifier',
      title: 'Strategy Session',
    });
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const body = 'type=intro-call&name=Guest';
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON' });
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.CALCOM_WEBHOOK_SECRET;
    const body = bookingEvent('BOOKING_CREATED');
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(500);
  });
});
