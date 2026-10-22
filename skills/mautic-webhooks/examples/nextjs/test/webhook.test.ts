import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const SECRET = 'test_mautic_secret';

beforeAll(() => {
  process.env.MAUTIC_WEBHOOK_SECRET = SECRET;
});

// Real Mautic algorithm: base64(HMAC-SHA256(rawBody, secret))
function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('base64');
}

function makeRequest(body: string, headers: Record<string, string>) {
  return new NextRequest('http://localhost:3000/webhooks/mautic', {
    method: 'POST',
    headers,
    body,
  });
}

const newContact = JSON.stringify({
  'mautic.lead_post_save_new': [
    { contact: { id: 1 }, timestamp: '2026-01-01T12:00:00+00:00' },
  ],
});

describe('verifyMauticWebhook', () => {
  it('accepts a valid signature', async () => {
    const { verifyMauticWebhook } = await import('../lib/verify');
    expect(verifyMauticWebhook(newContact, sign(newContact), SECRET)).toBe(true);
  });

  it('rejects a wrong secret, tampered body, and bad lengths', async () => {
    const { verifyMauticWebhook } = await import('../lib/verify');
    expect(verifyMauticWebhook(newContact, sign(newContact, 'other'), SECRET)).toBe(false);
    expect(verifyMauticWebhook(newContact + ' ', sign(newContact), SECRET)).toBe(false);
    expect(verifyMauticWebhook(newContact, 'short', SECRET)).toBe(false);
    expect(verifyMauticWebhook(newContact, null, SECRET)).toBe(false);
  });
});

describe('POST /webhooks/mautic', () => {
  it('returns 200 for a valid event', async () => {
    const { POST } = await import('../app/webhooks/mautic/route');
    const res = await POST(
      makeRequest(newContact, { 'content-type': 'application/json', 'webhook-signature': sign(newContact) })
    );
    expect(res.status).toBe(200);
  });

  it('verifies regardless of content type', async () => {
    const { POST } = await import('../app/webhooks/mautic/route');
    const res = await POST(
      makeRequest(newContact, { 'content-type': 'text/plain', 'webhook-signature': sign(newContact) })
    );
    expect(res.status).toBe(200);
  });

  it('handles batched events of several types', async () => {
    const { POST } = await import('../app/webhooks/mautic/route');
    const batch = JSON.stringify({
      'mautic.form_on_submit': [
        { submission: { id: 1 }, timestamp: '2026-01-01T12:00:00+00:00' },
        { submission: { id: 2 }, timestamp: '2026-01-01T12:00:01+00:00' },
      ],
      'mautic.email_on_open': [{ email: { id: 3 }, contact: { id: 4 }, timestamp: '2026-01-01T12:00:02+00:00' }],
      'mautic.unknown_event': [{ timestamp: '2026-01-01T12:00:03+00:00' }],
    });
    const res = await POST(
      makeRequest(batch, { 'content-type': 'application/json', 'webhook-signature': sign(batch) })
    );
    expect(res.status).toBe(200);
  });

  it('returns 400 for an invalid signature', async () => {
    const { POST } = await import('../app/webhooks/mautic/route');
    const res = await POST(
      makeRequest(newContact, { 'content-type': 'application/json', 'webhook-signature': sign(newContact, 'wrong') })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when the signature header is missing', async () => {
    const { POST } = await import('../app/webhooks/mautic/route');
    const res = await POST(makeRequest(newContact, { 'content-type': 'application/json' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const { POST } = await import('../app/webhooks/mautic/route');
    const res = await POST(
      makeRequest('not json', { 'content-type': 'application/json', 'webhook-signature': sign('not json') })
    );
    expect(res.status).toBe(400);
  });
});
