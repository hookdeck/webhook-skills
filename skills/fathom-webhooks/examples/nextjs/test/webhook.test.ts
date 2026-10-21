import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/fathom/route';

// Fathom secrets are 'whsec_' + base64-encoded key bytes
const WEBHOOK_SECRET = 'whsec_' + Buffer.from('test_fathom_webhook_secret_key').toString('base64');

/**
 * Sign a payload exactly as Fathom does (Standard Webhooks):
 * base64(HMAC-SHA256(base64decode(secret after whsec_), "{id}.{timestamp}.{body}"))
 */
function sign(body: string, id: string, timestamp: number, secret = WEBHOOK_SECRET): string {
  const key = Buffer.from(secret.split('_')[1], 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  return `v1,${signature}`;
}

interface Overrides {
  id?: string;
  timestamp?: number;
  signature?: string;
  secret?: string;
  omit?: string;
  sendBody?: string;
}

function buildRequest(body: string, o: Overrides = {}): NextRequest {
  const id = o.id ?? 'msg_2x2zwLOcWaRTzsLK8KtbQt1FTk9';
  const timestamp = o.timestamp ?? Math.floor(Date.now() / 1000);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'webhook-id': id,
    'webhook-timestamp': String(timestamp),
    'webhook-signature': o.signature ?? sign(body, id, timestamp, o.secret),
  };
  if (o.omit) delete headers[o.omit];
  return new NextRequest('http://localhost/webhooks/fathom', {
    method: 'POST',
    headers,
    body: o.sendBody ?? body,
  });
}

const meeting = {
  title: 'Quarterly Business Review',
  meeting_title: 'QBR 2025 Q1',
  recording_id: 123456789,
  url: 'https://fathom.video/xyz123',
  share_url: 'https://fathom.video/share/xyz123',
  created_at: '2025-03-01T17:01:30Z',
  transcript_language: 'en',
  shared_with: 'single_team',
  calendar_invitees_domains_type: 'one_or_more_external',
  recorded_by: { name: 'Alice Johnson', email: 'alice.johnson@acme.com', email_domain: 'acme.com', team: 'Marketing' },
  calendar_invitees: [],
  default_summary: { template_name: 'general', markdown_formatted: '## Summary\nWe reviewed Q1 OKRs.' },
  action_items: [{
    description: 'Email revised proposal to client',
    user_generated: false,
    completed: false,
    recording_timestamp: '00:10:45',
    recording_playback_url: 'https://fathom.video/calls/xyz123?timestamp=645',
    assignee: { name: 'Alice Johnson', email: 'alice.johnson@acme.com', team: 'Marketing' },
  }],
  transcript: [{ speaker: { display_name: 'Alice Johnson' }, text: "Let's revisit the budget allocations.", timestamp: '00:05:32' }],
};

describe('POST /webhooks/fathom', () => {
  beforeEach(() => {
    process.env.FATHOM_WEBHOOK_SECRET = WEBHOOK_SECRET;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it('accepts a correctly signed meeting payload', async () => {
    const res = await POST(buildRequest(JSON.stringify(meeting)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts a payload without optional summary, transcript or action items', async () => {
    const { default_summary, action_items, transcript, ...minimal } = meeting;
    const res = await POST(buildRequest(JSON.stringify(minimal)));
    expect(res.status).toBe(200);
  });

  it('accepts when one of several space-delimited signatures matches', async () => {
    const body = JSON.stringify(meeting);
    const timestamp = Math.floor(Date.now() / 1000);
    const valid = sign(body, 'msg_1', timestamp);
    const res = await POST(buildRequest(body, { id: 'msg_1', timestamp, signature: `v1,aW52YWxpZA== ${valid}` }));
    expect(res.status).toBe(200);
  });

  it('rejects an invalid signature', async () => {
    const res = await POST(buildRequest(JSON.stringify(meeting), { signature: 'v1,aW52YWxpZHNpZ25hdHVyZQ==' }));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with a different secret', async () => {
    const other = 'whsec_' + Buffer.from('some_other_secret').toString('base64');
    const res = await POST(buildRequest(JSON.stringify(meeting), { secret: other }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(meeting);
    const res = await POST(buildRequest(body, { sendBody: JSON.stringify({ ...meeting, title: 'Tampered' }) }));
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp older than 5 minutes', async () => {
    const timestamp = Math.floor(Date.now() / 1000) - 600;
    const res = await POST(buildRequest(JSON.stringify(meeting), { timestamp }));
    expect(res.status).toBe(400);
  });

  it.each(['webhook-id', 'webhook-timestamp', 'webhook-signature'])('rejects a request missing %s', async (header) => {
    const res = await POST(buildRequest(JSON.stringify(meeting), { omit: header }));
    expect(res.status).toBe(400);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.FATHOM_WEBHOOK_SECRET;
    const res = await POST(buildRequest(JSON.stringify(meeting)));
    expect(res.status).toBe(500);
  });
});
