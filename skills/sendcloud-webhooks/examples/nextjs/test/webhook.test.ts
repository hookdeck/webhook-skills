// Generated with: sendcloud-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/sendcloud/route';

const SECRET = 'secretkey';

function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function makeRequest(body: string, signature?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature !== undefined) headers['sendcloud-signature'] = signature;
  return new NextRequest('http://localhost:3000/webhooks/sendcloud', {
    method: 'POST',
    headers,
    body,
  });
}

describe('POST /webhooks/sendcloud', () => {
  beforeEach(() => {
    process.env.SENDCLOUD_WEBHOOK_SECRET = SECRET;
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SENDCLOUD_WEBHOOK_SECRET;
  });

  it('matches the documented test vector', () => {
    expect(sign('{"key": "value"}')).toBe(
      '1eed4b3d41f4653ac64fd56f1bf1cbfd349e4482cbc11dff7134bd93e5da4b0a'
    );
  });

  const events = [
    { action: 'parcel_status_changed', timestamp: 1, parcel: { id: 1, status: { id: 1, message: 'Ready to send' } } },
    { action: 'return_created', timestamp: 1, data: { id: 42, order_number: 'ORD1' } },
    { action: 'integration_connected', timestamp: 1, integration: { id: 1 } },
    { action: 'integration_updated', timestamp: 1, integration: { id: 1 } },
    { action: 'integration_deleted', timestamp: 1, integration: { id: 1 } },
  ];

  it.each(events)('accepts a valid $action webhook', async (event) => {
    const body = JSON.stringify(event);
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies regardless of content type', async () => {
    const body = JSON.stringify(events[0]);
    const res = await POST(makeRequest(body, sign(body), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('verifies the exact bytes, including unusual whitespace', async () => {
    const body = '{"action":  "parcel_status_changed",\n "timestamp": 1}';
    expect((await POST(makeRequest(body, sign(body)))).status).toBe(200);
  });

  it('accepts unknown actions', async () => {
    const body = JSON.stringify({ action: 'something_new' });
    expect((await POST(makeRequest(body, sign(body)))).status).toBe(200);
  });

  it('rejects an invalid signature', async () => {
    const body = JSON.stringify(events[0]);
    expect((await POST(makeRequest(body, 'a'.repeat(64)))).status).toBe(400);
  });

  it('rejects a signature of the wrong length', async () => {
    const body = JSON.stringify(events[0]);
    expect((await POST(makeRequest(body, 'abc'))).status).toBe(400);
  });

  it('rejects a signature made with another secret', async () => {
    const body = JSON.stringify(events[0]);
    expect((await POST(makeRequest(body, sign(body, 'other')))).status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(events[0]);
    const sig = sign(body);
    expect((await POST(makeRequest(body.replace('1', '2'), sig))).status).toBe(400);
  });

  it('rejects a missing signature header', async () => {
    const body = JSON.stringify(events[0]);
    expect((await POST(makeRequest(body))).status).toBe(400);
  });

  it('rejects signed invalid JSON', async () => {
    const body = 'not json';
    expect((await POST(makeRequest(body, sign(body), 'text/plain'))).status).toBe(400);
  });

  it('fails closed when no secret is configured', async () => {
    delete process.env.SENDCLOUD_WEBHOOK_SECRET;
    const body = JSON.stringify(events[0]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await POST(makeRequest(body, sign(body)))).status).toBe(500);
  });
});
