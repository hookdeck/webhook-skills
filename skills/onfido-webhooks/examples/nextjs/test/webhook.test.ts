import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Webhook tokens are opaque strings; Onfido uses the raw UTF-8 string as the HMAC key
const TOKEN = 'test_onfido_webhook_token';

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.ONFIDO_WEBHOOK_TOKEN = TOKEN;
  ({ POST } = await import('../app/webhooks/onfido/route'));
});

function sign(body: string, token = TOKEN) {
  return crypto.createHmac('sha256', token).update(body).digest('hex');
}

function event(action: string, resourceType: string) {
  return JSON.stringify({
    payload: { resource_type: resourceType, action, object: { id: 'abc123', status: 'complete' } },
  });
}

function makeRequest(body: string, signature?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature) headers['x-sha2-signature'] = signature;
  return new NextRequest('http://localhost:3000/webhooks/onfido', { method: 'POST', headers, body });
}

describe('POST /webhooks/onfido', () => {
  it.each([
    ['check.completed', 'check'],
    ['report.completed', 'report'],
    ['workflow_run.completed', 'workflow_run'],
    ['workflow_task.completed', 'workflow_task'],
  ])('accepts a signed %s event', async (action, resourceType) => {
    const body = event(action, resourceType);
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts a signed event with an unhandled action', async () => {
    const body = event('watchlist_monitor.matches_updated', 'watchlist_monitor');
    expect((await POST(makeRequest(body, sign(body)))).status).toBe(200);
  });

  it('rejects a missing signature', async () => {
    expect((await POST(makeRequest(event('check.completed', 'check')))).status).toBe(400);
  });

  it('rejects an invalid signature', async () => {
    const res = await POST(makeRequest(event('check.completed', 'check'), 'a'.repeat(64)));
    expect(res.status).toBe(400);
  });

  it('rejects a malformed signature', async () => {
    const res = await POST(makeRequest(event('check.completed', 'check'), 'xyz'));
    expect(res.status).toBe(400);
  });

  it('rejects a body modified after signing', async () => {
    const body = event('check.completed', 'check');
    const res = await POST(makeRequest(body.replace('abc123', 'evil'), sign(body)));
    expect(res.status).toBe(400);
  });

  it('verifies the exact raw bytes, including whitespace', async () => {
    const body = '{ "payload" :  {"resource_type":"check","action":"check.completed","object":{"id":"x"}} }';
    expect((await POST(makeRequest(body, sign(body)))).status).toBe(200);
  });
});
