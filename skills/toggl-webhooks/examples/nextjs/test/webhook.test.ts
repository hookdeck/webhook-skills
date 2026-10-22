import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/toggl/route';
import { verifyTogglWebhook } from '../lib/toggl';

// Docs test vector (engineering.toggl.com "Validating Received Events")
const DOCS_SECRET = 'PGuRrhCFajIyEvFlreKL';
const DOCS_PING_BODY =
  '{"event_id":0,"created_at":"2022-06-25T03:58:10.207820267Z","creator_id":6,"metadata":{"request_type":"POST","event_user_id":6},"payload":"ping","subscription_id":6,"timestamp":"2022-06-25T03:58:10.207820267Z","url_callback":"https://callback-url.com"}';
const DOCS_PING_SIGNATURE =
  'sha256=bf829606cda0ca6923defb5ca70a43135adc7e8887486a201a19cb50ca6006b1';

beforeAll(() => {
  process.env.TOGGL_WEBHOOK_SECRET = DOCS_SECRET;
});

function sign(body: string, secret = DOCS_SECRET): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function entityEvent(model: string, action: string, payload: object = {}): string {
  return JSON.stringify({
    event_id: 42,
    creator_id: 6,
    metadata: { action, model, event_user_id: 6, request_type: 'POST' },
    payload,
    subscription_id: 6,
    timestamp: '2024-01-01T00:00:00Z',
    url_callback: 'https://callback-url.com',
  });
}

function makeRequest(body: string, signature?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature) headers['x-webhook-signature-256'] = signature;
  return new NextRequest('http://localhost:3000/webhooks/toggl', {
    method: 'POST',
    headers,
    body,
  });
}

describe('verifyTogglWebhook', () => {
  it('accepts the documented test vector', () => {
    expect(verifyTogglWebhook(DOCS_PING_BODY, DOCS_PING_SIGNATURE, DOCS_SECRET)).toBe(true);
  });

  it('rejects wrong secret, tampered body, and bad signatures', () => {
    expect(verifyTogglWebhook(DOCS_PING_BODY, DOCS_PING_SIGNATURE, 'other')).toBe(false);
    expect(verifyTogglWebhook(DOCS_PING_BODY + ' ', DOCS_PING_SIGNATURE, DOCS_SECRET)).toBe(false);
    expect(verifyTogglWebhook(DOCS_PING_BODY, null, DOCS_SECRET)).toBe(false);
    expect(verifyTogglWebhook(DOCS_PING_BODY, 'sha256=short', DOCS_SECRET)).toBe(false);
    expect(
      verifyTogglWebhook(DOCS_PING_BODY, DOCS_PING_SIGNATURE.replace('sha256=', ''), DOCS_SECRET)
    ).toBe(false);
  });
});

describe('POST /webhooks/toggl', () => {
  it('returns 400 when the signature header is missing', async () => {
    const res = await POST(makeRequest(DOCS_PING_BODY));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await POST(makeRequest(DOCS_PING_BODY, 'sha256=' + 'a'.repeat(64)));
    expect(res.status).toBe(400);
  });

  it('accepts the documented PING', async () => {
    const res = await POST(makeRequest(DOCS_PING_BODY, DOCS_PING_SIGNATURE));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('echoes validation_code on PING', async () => {
    const body = JSON.stringify({ ...JSON.parse(DOCS_PING_BODY), validation_code: 'abc123' });
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ validation_code: 'abc123' });
  });

  it('verifies regardless of content type', async () => {
    const body = entityEvent('time_entry', 'created', { description: 'Work' });
    const res = await POST(makeRequest(body, sign(body), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it.each([
    ['time_entry', 'created'],
    ['time_entry', 'updated'],
    ['time_entry', 'deleted'],
    ['project', 'created'],
    ['project', 'updated'],
    ['project', 'deleted'],
    ['tag', 'created'],
  ])('handles %s %s', async (model, action) => {
    const body = entityEvent(model, action, { id: 1, name: 'x', description: 'y' });
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, sign(body), 'text/plain'));
    expect(res.status).toBe(400);
  });
});
