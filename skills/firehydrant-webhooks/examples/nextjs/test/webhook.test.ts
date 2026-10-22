import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import crypto from 'crypto';
import { verifyFireHydrantWebhook } from '../lib/verify';
import { POST } from '../app/webhooks/firehydrant/route';

const secret = 'test_firehydrant_secret';

beforeAll(() => {
  process.env.FIREHYDRANT_WEBHOOK_SECRET = secret;
});

// Same algorithm FireHydrant uses: bare hex HMAC-SHA256 of the raw body
function sign(payload: string, key: string = secret): string {
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

const incidentPayload = JSON.stringify({
  data: { incident: { number: 602, name: 'Test incident', current_milestone: 'resolved' } },
  event: { operation: 'UPDATED', resource_type: 'incident' },
});
const changeEventPayload = JSON.stringify({
  data: { id: '489d7b90', summary: 'Production Deploy' },
  event: { operation: 'updated', resource_type: 'change_event' },
});
const alertPayload = JSON.stringify({
  data: { alert: { id: '6f76', summary: 'High error rate', status: 'opened', decision: null } },
  event: { operation: 'CREATED', resource_type: 'signals_alerts' },
});

function makeRequest(body: string, signature?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature) headers['fh-signature'] = signature;
  return new Request('http://localhost/webhooks/firehydrant', { method: 'POST', headers, body }) as any;
}

describe('verifyFireHydrantWebhook', () => {
  it('accepts a valid signature', () => {
    expect(verifyFireHydrantWebhook(incidentPayload, sign(incidentPayload), secret)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    expect(verifyFireHydrantWebhook(incidentPayload, 'invalid', secret)).toBe(false);
  });

  it('rejects a missing signature', () => {
    expect(verifyFireHydrantWebhook(incidentPayload, null, secret)).toBe(false);
  });

  it('rejects the wrong secret', () => {
    expect(verifyFireHydrantWebhook(incidentPayload, sign(incidentPayload, 'other'), secret)).toBe(false);
  });

  it('rejects a tampered body', () => {
    expect(verifyFireHydrantWebhook(incidentPayload + ' ', sign(incidentPayload), secret)).toBe(false);
  });

  it('does not accept a sha256= prefixed signature', () => {
    expect(verifyFireHydrantWebhook(incidentPayload, `sha256=${sign(incidentPayload)}`, secret)).toBe(false);
  });
});

describe('POST /webhooks/firehydrant', () => {
  beforeEach(() => {
    process.env.FIREHYDRANT_WEBHOOK_SECRET = secret;
  });

  it('returns 400 for a missing signature', async () => {
    const res = await POST(makeRequest(incidentPayload));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await POST(makeRequest(incidentPayload, 'deadbeef'));
    expect(res.status).toBe(400);
  });

  it('handles an incident event', async () => {
    const res = await POST(makeRequest(incidentPayload, sign(incidentPayload)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('handles a change_event event', async () => {
    const res = await POST(makeRequest(changeEventPayload, sign(changeEventPayload)));
    expect(res.status).toBe(200);
  });

  it('handles a signals_alerts event', async () => {
    const res = await POST(makeRequest(alertPayload, sign(alertPayload)));
    expect(res.status).toBe(200);
  });

  it('verifies when the content type is not JSON', async () => {
    const res = await POST(makeRequest(incidentPayload, sign(incidentPayload), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const res = await POST(makeRequest('not json', sign('not json'), 'text/plain'));
    expect(res.status).toBe(400);
  });
});
