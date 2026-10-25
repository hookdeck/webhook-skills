// Generated with: beehiiv-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/beehiiv/route';

// Svix-style secret: "whsec_" + base64 of the key bytes
const SECRET = 'whsec_' + Buffer.from('beehiiv-test-signing-key-01234567').toString('base64');

/** Sign exactly like Svix does: HMAC-SHA256 over `${id}.${ts}.${body}`, base64. */
function sign(rawBody: string, id: string, timestamp: string, secret = SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`, 'utf8').digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);

function signedHeaders(
  rawBody: string,
  opts: { id?: string; timestamp?: number; secret?: string; signature?: string } = {}
): Record<string, string> {
  const id = opts.id || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(opts.timestamp ?? now());
  return {
    'content-type': 'application/json',
    'svix-id': id,
    'svix-timestamp': ts,
    'svix-signature': opts.signature ?? sign(rawBody, id, ts, opts.secret),
  };
}

const envelope = (event_type: string, data: object = {}, uid = `evt_${crypto.randomUUID()}`) =>
  JSON.stringify({ uid, event_type, event_timestamp: 1792922400, data });

function post(rawBody: string, headers: Record<string, string>) {
  return POST(new Request('http://localhost:3000/webhooks/beehiiv', { method: 'POST', headers, body: rawBody }));
}

describe('POST /webhooks/beehiiv', () => {
  beforeEach(() => {
    process.env.BEEHIIV_WEBHOOK_SECRET = SECRET;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.BEEHIIV_WEBHOOK_SECRET;
  });

  it('returns 200 for each documented event type', async () => {
    for (const type of [
      'post.sent',
      'post.updated',
      'post.scheduled',
      'subscription.created',
      'subscription.confirmed',
      'subscription.deleted',
      'subscription.upgraded',
      'subscription.downgraded',
      'subscription.paused',
      'subscription.resumed',
      'newsletter_list_subscription.subscribed',
      'survey.response_submitted',
      'podcasts.episode.published',
      'something.new',
    ]) {
      const body = envelope(type, { id: 'x_1', email: 'ada@example.com' });
      const res = await post(body, signedHeaders(body));
      expect(res.status).toBe(200);
    }
  });

  it('accepts when any space-separated v1 entry matches', async () => {
    const body = envelope('post.sent');
    const h = signedHeaders(body);
    h['svix-signature'] = `v1,${Buffer.from('nope').toString('base64')} ${h['svix-signature']}`;
    expect((await post(body, h)).status).toBe(200);
  });

  it('acknowledges a duplicate uid without reprocessing', async () => {
    const body = envelope('post.sent', {}, 'evt_dup');
    await post(body, signedHeaders(body));
    const res = await post(body, signedHeaders(body, { id: 'msg_retry' }));
    expect(res.status).toBe(200);
    expect((await res.json()).duplicate).toBe(true);
  });

  it('returns 400 for a wrong secret', async () => {
    const body = envelope('post.sent');
    const other = 'whsec_' + Buffer.from('other-key').toString('base64');
    expect((await post(body, signedHeaders(body, { secret: other }))).status).toBe(400);
  });

  it('returns 400 for a tampered body', async () => {
    const body = envelope('post.sent');
    expect((await post(body + ' ', signedHeaders(body))).status).toBe(400);
  });

  it('returns 400 for a timestamp older than 5 minutes (library window)', async () => {
    const body = envelope('post.sent');
    expect((await post(body, signedHeaders(body, { timestamp: now() - 3600 }))).status).toBe(400);
  });

  it('returns 400 for missing headers', async () => {
    expect((await post(envelope('post.sent'), { 'content-type': 'application/json' })).status).toBe(400);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.BEEHIIV_WEBHOOK_SECRET;
    const body = envelope('post.sent');
    expect((await post(body, signedHeaders(body))).status).toBe(500);
  });
});
