import crypto from 'crypto';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/oh-dear/route';

const SECRET = 'YoUrSeCreT'; // Oh Dear secrets are used as plain UTF-8 text

// Based on the monitorAddedNotification example in Oh Dear's docs
const monitorAdded = JSON.stringify({
  type: 'monitorAddedNotification',
  date_time: '20191001113659',
  monitor: {
    id: 1,
    url: 'https://yoursite.tld',
    uses_https: true,
    sort_url: 'yoursite.tld',
    label: 'yoursite.tld',
    team_id: 1,
    latest_run_date: null,
    summarized_check_result: 'pending',
    created_at: '2019-10-01 09:36:59',
    updated_at: '2019-10-01 09:36:59',
    checks: [{ id: 39675, type: 'uptime', enabled: true, monitor_id: 1, latest_run_result: null }],
  },
}, null, 2);

const uptimeFailed = (kind: string) => JSON.stringify({
  uuid: '860e04a8-2025-4793-a45c-c9ad71710cf2',
  type: `${kind}UptimeCheckFailedNotification`,
  date_time: '20180312092737',
  result_url: 'https://ohdear.app/monitors/1/check/uptime/report/2',
});

function sign(body: string, secret = SECRET): string {
  // hash_hmac('sha256', $payload, $secret): lowercase hex of the raw body
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function makeRequest(body: string, signature?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature !== undefined) headers['ohdear-signature'] = signature;
  return new NextRequest('http://localhost/webhooks/oh-dear', { method: 'POST', headers, body });
}

describe('Oh Dear webhook', () => {
  beforeAll(() => {
    process.env.OH_DEAR_WEBHOOK_SECRET = SECRET;
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('accepts the documented monitorAddedNotification with a valid signature', async () => {
    const res = await POST(makeRequest(monitorAdded, sign(monitorAdded)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it.each(['http', 'tcp', 'ping'])('accepts %s uptime failures', async (kind) => {
    const body = uptimeFailed(kind);
    expect((await POST(makeRequest(body, sign(body)))).status).toBe(200);
  });

  it('accepts an uppercase hex signature', async () => {
    expect((await POST(makeRequest(monitorAdded, sign(monitorAdded).toUpperCase()))).status).toBe(200);
  });

  it('verifies raw bytes whatever the content type is', async () => {
    const res = await POST(makeRequest(monitorAdded, sign(monitorAdded), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 200 for unhandled event types', async () => {
    const body = JSON.stringify({ uuid: 'u', type: 'lighthouseIssuesFixedNotification' });
    expect((await POST(makeRequest(body, sign(body)))).status).toBe(200);
  });

  it('returns 401 when the signature header is missing', async () => {
    expect((await POST(makeRequest(monitorAdded))).status).toBe(401);
  });

  it('returns 401 when the signature header is empty', async () => {
    expect((await POST(makeRequest(monitorAdded, ''))).status).toBe(401);
  });

  it('returns 401 for a signature with a sha256= prefix', async () => {
    expect((await POST(makeRequest(monitorAdded, `sha256=${sign(monitorAdded)}`))).status).toBe(401);
  });

  it.each([
    ['too short', 'abc123'],
    ['too long', 'a'.repeat(66)],
    ['non-hex characters', 'z'.repeat(64)],
  ])('returns 401 for a malformed signature (%s)', async (_name, sig) => {
    expect((await POST(makeRequest(monitorAdded, sig))).status).toBe(401);
  });

  it('returns 401 for a signature made with the wrong secret', async () => {
    expect((await POST(makeRequest(monitorAdded, sign(monitorAdded, 'other')))).status).toBe(401);
  });

  it('returns 401 when the body was tampered with', async () => {
    const tampered = monitorAdded.replace('yoursite.tld', 'evil.tld');
    expect((await POST(makeRequest(tampered, sign(monitorAdded)))).status).toBe(401);
  });

  it('returns 401 when the body was re-serialized (different bytes)', async () => {
    const compact = JSON.stringify(JSON.parse(monitorAdded));
    expect((await POST(makeRequest(compact, sign(monitorAdded)))).status).toBe(401);
  });

  it('returns 400 for a correctly signed body that is not JSON', async () => {
    const body = 'not json';
    expect((await POST(makeRequest(body, sign(body), 'text/plain'))).status).toBe(400);
  });
});
