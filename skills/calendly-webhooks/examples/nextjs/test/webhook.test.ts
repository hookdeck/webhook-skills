import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

// Set test environment variables before importing the route
beforeAll(() => {
  process.env.CALENDLY_WEBHOOK_SIGNING_KEY = 'test_signing_key';
});

const signingKey = 'test_signing_key';

/**
 * Generate a valid Calendly signature header for testing.
 * Format: t=<timestamp>,v1=<hmac-sha256 hex of "{timestamp}.{payload}">
 */
function generateCalendlySignature(
  payload: string,
  secret: string,
  timestamp: number = Math.floor(Date.now() / 1000)
): string {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

function makeRequest(payload: string, header?: string) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (header) headers.set('Calendly-Webhook-Signature', header);
  return new Request('http://localhost/webhooks/calendly', {
    method: 'POST',
    headers,
    body: payload,
  });
}

describe('Calendly Webhook Route', () => {
  it('returns 400 for a missing signature header', async () => {
    const { POST } = await import('../app/webhooks/calendly/route');
    const res = await POST(makeRequest('{}') as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const { POST } = await import('../app/webhooks/calendly/route');
    const payload = JSON.stringify({ event: 'invitee.created' });
    const res = await POST(makeRequest(payload, 't=9999999999,v1=deadbeef') as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 for a tampered payload', async () => {
    const { POST } = await import('../app/webhooks/calendly/route');
    const original = JSON.stringify({ event: 'invitee.created', payload: { email: 'jane@example.com' } });
    const header = generateCalendlySignature(original, signingKey);
    const tampered = JSON.stringify({ event: 'invitee.created', payload: { email: 'attacker@example.com' } });
    const res = await POST(makeRequest(tampered, header) as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 for a stale timestamp (replay protection)', async () => {
    const { POST } = await import('../app/webhooks/calendly/route');
    const payload = JSON.stringify({ event: 'invitee.created' });
    const oldTs = Math.floor(Date.now() / 1000) - 400;
    const header = generateCalendlySignature(payload, signingKey, oldTs);
    const res = await POST(makeRequest(payload, header) as any);
    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid signature', async () => {
    const { POST } = await import('../app/webhooks/calendly/route');
    const payload = JSON.stringify({ event: 'invitee.created', payload: { email: 'jane@example.com' } });
    const header = generateCalendlySignature(payload, signingKey);
    const res = await POST(makeRequest(payload, header) as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('handles all supported event types', async () => {
    const { POST } = await import('../app/webhooks/calendly/route');
    const eventTypes = [
      'invitee.created',
      'invitee.canceled',
      'invitee_no_show.created',
      'routing_form_submission.created',
      'unknown.event',
    ];

    for (const eventType of eventTypes) {
      const payload = JSON.stringify({ event: eventType, payload: { email: 'jane@example.com' } });
      const header = generateCalendlySignature(payload, signingKey);
      const res = await POST(makeRequest(payload, header) as any);
      expect(res.status).toBe(200);
    }
  });
});

describe('verifyCalendlySignature', () => {
  it('validates a correct signature', async () => {
    const { verifyCalendlySignature } = await import('../app/webhooks/calendly/route');
    const payload = JSON.stringify({ event: 'invitee.created' });
    const header = generateCalendlySignature(payload, signingKey);
    expect(verifyCalendlySignature(payload, header, signingKey)).toBe(true);
  });

  it('rejects a malformed header', async () => {
    const { verifyCalendlySignature } = await import('../app/webhooks/calendly/route');
    const payload = JSON.stringify({ event: 'invitee.created' });
    expect(verifyCalendlySignature(payload, 'not-valid', signingKey)).toBe(false);
  });

  it('generates the expected header format', () => {
    const header = generateCalendlySignature('{"test":true}', signingKey);
    expect(header).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
  });
});
