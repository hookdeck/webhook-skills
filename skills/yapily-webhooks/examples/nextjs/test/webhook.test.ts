import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const secret = 'test_yapily_secret';

beforeAll(() => {
  process.env.YAPILY_WEBHOOK_SECRET = secret;
});

// Yapily: lowercase hex HMAC-SHA256 of the raw body, key = secret as UTF-8
function sign(payload: string, key: string = secret): string {
  return crypto.createHmac('sha256', Buffer.from(key, 'utf-8')).update(payload).digest('hex');
}

function makeEvent(type: string, event: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: '41285f64-5717-4562-b3fc-2c961236afa6',
    applicationId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    type,
    event,
    metadata: { tracingId: '6cf5ef06-9f96-4f24-8bab-32ab09128010', user: { key: 'value' } },
  });
}

function makeRequest(body: string, headers: Record<string, string>, contentType = 'application/json') {
  return new NextRequest('http://localhost:3000/webhooks/yapily', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('verifyYapilyWebhook', async () => {
  const { verifyYapilyWebhook } = await import('../lib/verify');
  const body = makeEvent('single_payment.status.completed', { status: 'COMPLETED' });

  it('accepts a valid webhook-signature', () => {
    expect(verifyYapilyWebhook(body, [sign(body), null], secret)).toBe(true);
  });

  it('accepts an uppercase signature (case-insensitive)', () => {
    expect(verifyYapilyWebhook(body, [sign(body).toUpperCase()], secret)).toBe(true);
  });

  it('accepts a valid webhook-rotation-signature when the primary is stale', () => {
    expect(verifyYapilyWebhook(body, ['0'.repeat(64), sign(body)], secret)).toBe(true);
  });

  it('rejects the wrong secret', () => {
    expect(verifyYapilyWebhook(body, [sign(body, 'other')], secret)).toBe(false);
  });

  it('rejects a tampered body', () => {
    expect(verifyYapilyWebhook(body + ' ', [sign(body)], secret)).toBe(false);
  });

  it('rejects a wrong-length signature without throwing', () => {
    expect(verifyYapilyWebhook(body, ['abc'], secret)).toBe(false);
  });

  it('rejects missing signatures', () => {
    expect(verifyYapilyWebhook(body, [null, undefined], secret)).toBe(false);
  });
});

describe('POST /webhooks/yapily', async () => {
  const { POST } = await import('../app/webhooks/yapily/route');

  const events = [
    'single_payment.status.completed',
    'single_payment.status.updated',
    'single_payment.iso_status.updated',
    'hosted_pis.payment_status.completed.v1',
    'hosted_pis.payment_status.failed.v1',
  ];

  it.each(events)('accepts %s', async (type) => {
    const body = makeEvent(type, { status: 'COMPLETED' });
    const res = await POST(makeRequest(body, { 'webhook-signature': sign(body) }));
    expect(res.status).toBe(200);
  });

  it('verifies regardless of content type', async () => {
    const body = makeEvent('single_payment.status.completed');
    const res = await POST(makeRequest(body, { 'webhook-signature': sign(body) }, 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('accepts a request signed only in webhook-rotation-signature', async () => {
    const body = makeEvent('single_payment.status.completed');
    const res = await POST(
      makeRequest(body, { 'webhook-signature': '0'.repeat(64), 'webhook-rotation-signature': sign(body) })
    );
    expect(res.status).toBe(200);
  });

  it('returns 200 for unknown event types', async () => {
    const body = makeEvent('some.future.type');
    const res = await POST(makeRequest(body, { 'webhook-signature': sign(body) }));
    expect(res.status).toBe(200);
  });

  it('returns 400 for an invalid signature', async () => {
    const body = makeEvent('single_payment.status.completed');
    const res = await POST(makeRequest(body, { 'webhook-signature': 'f'.repeat(64) }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when the signature header is missing', async () => {
    const res = await POST(makeRequest(makeEvent('single_payment.status.completed'), {}));
    expect(res.status).toBe(400);
  });

  it('returns 400 for validly signed non-JSON', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, { 'webhook-signature': sign(body) }, 'text/plain'));
    expect(res.status).toBe(400);
  });
});
