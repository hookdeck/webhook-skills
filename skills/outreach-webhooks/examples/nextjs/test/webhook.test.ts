import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { POST } from '../app/webhooks/outreach/route';

const SECRET = 'outreach_test_secret_0123456789';

// Same algorithm as Outreach: bare hex HMAC-SHA256 of the raw body
function sign(body: string, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

const payload = JSON.stringify({
  data: { type: 'prospect', id: 42, attributes: { firstName: 'Ada' } },
  meta: { deliveredAt: '2025-10-21T22:54:57.000Z', eventName: 'prospect.created' },
});

function makeRequest(body: string, headers: Record<string, string> = {}, contentType = 'application/json') {
  return new NextRequest('http://localhost:3000/webhooks/outreach', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('Outreach webhook (Next.js)', () => {
  beforeEach(() => {
    process.env.OUTREACH_WEBHOOK_SECRET = SECRET;
  });

  it('accepts a valid signature', async () => {
    const res = await POST(makeRequest(payload, { 'outreach-webhook-signature': sign(payload) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies any content type, e.g. application/vnd.api+json', async () => {
    const res = await POST(makeRequest(payload, { 'outreach-webhook-signature': sign(payload) }, 'application/vnd.api+json'));
    expect(res.status).toBe(200);
  });

  it('handles each documented event', async () => {
    for (const eventName of ['prospect.updated', 'sequenceState.created', 'call.created', 'task.completed', 'mailing.replied', 'account.destroyed']) {
      const body = JSON.stringify({ data: { type: 'x', id: 1 }, meta: { eventName } });
      const res = await POST(makeRequest(body, { 'outreach-webhook-signature': sign(body) }));
      expect(res.status).toBe(200);
    }
  });

  it('rejects a signature made with the wrong secret', async () => {
    const res = await POST(makeRequest(payload, { 'outreach-webhook-signature': sign(payload, 'other') }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const res = await POST(makeRequest(payload.replace('Ada', 'Eve'), { 'outreach-webhook-signature': sign(payload) }));
    expect(res.status).toBe(400);
  });

  it('rejects a signature of the wrong length without throwing', async () => {
    const res = await POST(makeRequest(payload, { 'outreach-webhook-signature': 'abc123' }));
    expect(res.status).toBe(400);
  });

  it('rejects a missing signature header', async () => {
    const res = await POST(makeRequest(payload));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a valid signature with invalid JSON', async () => {
    const res = await POST(makeRequest('not json', { 'outreach-webhook-signature': sign('not json') }));
    expect(res.status).toBe(400);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.OUTREACH_WEBHOOK_SECRET;
    const res = await POST(makeRequest(payload, { 'outreach-webhook-signature': sign(payload) }));
    expect(res.status).toBe(500);
  });
});
