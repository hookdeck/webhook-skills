// Generated with: ada-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/ada/route';

// Ada (Svix) secrets look like "whsec_" + base64(key bytes), for example
// "whsec_C2FVsBQIhrscChlQIMV+b5sSYspob7oD". The HMAC key is the decoded part.
const SECRET = 'whsec_' + Buffer.from('ada-test-signing-key-0123456789ab').toString('base64');

/** Sign exactly like Svix does for Ada deliveries. */
function sign(rawBody: string, id: string, timestamp: string, secret = SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`, 'utf8')
    .digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);

interface SignOptions {
  id?: string;
  timestamp?: number | string;
  secret?: string;
  signature?: string;
}

function signedHeaders(rawBody: string, opts: SignOptions = {}): Record<string, string> {
  const id = opts.id || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(opts.timestamp ?? now());
  return {
    'content-type': 'application/json',
    'svix-id': id,
    'svix-timestamp': ts,
    'svix-signature': opts.signature ?? sign(rawBody, id, ts, opts.secret),
  };
}

function post(rawBody: string, headers: Record<string, string>) {
  return POST(
    new Request('http://localhost:3000/webhooks/ada', {
      method: 'POST',
      headers,
      body: rawBody,
    })
  );
}

const event = (type: string, data: Record<string, unknown>) => ({
  type,
  timestamp: '2026-10-21T09:30:00.123Z',
  data,
});

const conversationCreated = () =>
  event('v1.conversation.created', {
    conversation_id: '5f7e0e2c1a2b3c4d5e6f7a8b',
    channel_id: '5df263b7db5a7e6ea03fae9b',
    created_at: '2026-10-21T09:30:00Z',
    end_user_id: '5f7e0e2c1a2b3c4d5e6f7a8c',
    metadata: { plan: 'pro' },
    ai_agent_domain: 'example.ada.support',
  });

beforeEach(() => {
  process.env.ADA_WEBHOOK_SECRET = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('valid signatures', () => {
  it('accepts v1.conversation.created', async () => {
    const body = JSON.stringify(conversationCreated());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Conversation created'));
  });

  it('accepts v1.conversation.message', async () => {
    const body = JSON.stringify(
      event('v1.conversation.message', {
        message_id: 'msg-1',
        conversation_id: '5f7e0e2c1a2b3c4d5e6f7a8b',
        end_user_id: '5f7e0e2c1a2b3c4d5e6f7a8c',
        handoff_integration: null,
        author: { id: null, role: 'end_user', avatar: null, display_name: null },
        content: { type: 'text', body: 'Where is my order?' },
        ai_agent_domain: 'example.ada.support',
      })
    );
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('from end_user: text'));
  });

  it('accepts v1.conversation.ended', async () => {
    const body = JSON.stringify(
      event('v1.conversation.ended', {
        conversation_id: '5f7e0e2c1a2b3c4d5e6f7a8b',
        ended_by: { id: null, role: 'end_user' },
      })
    );
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('accepts v1.audit_log.emitted', async () => {
    const body = JSON.stringify({
      ...event('v1.audit_log.emitted', {
        id: 'ae_1',
        timestamp: '2026-10-21T09:30:00.123Z',
        entity_type: 'webhook',
        entity_id: 'ep_2bxE8VNtkWEMpJrMJv74FlSQmqP',
        activity: 'updated',
      }),
      tags: ['webhook', 'updated', 'ep_2bxE8VNtkWEMpJrMJv74FlSQmqP'],
    });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('acknowledges unknown event types with 200', async () => {
    const body = JSON.stringify(event('v1.something.new', {}));
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('accepts when any one of several space-separated signatures matches (rotation)', async () => {
    const body = JSON.stringify(conversationCreated());
    const headers = signedHeaders(body);
    headers['svix-signature'] = `v1,bm90LXRoZS1yaWdodC1zaWc= ${headers['svix-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('returns 200 for a retried delivery with the same svix-id', async () => {
    const body = JSON.stringify(conversationCreated());
    const id = `msg_retry_${Date.now()}`;
    const first = await post(body, signedHeaders(body, { id }));
    const second = await post(body, signedHeaders(body, { id }));
    expect(first.status).toBe(200);
    expect(await second.json()).toEqual({ received: true, duplicate: true });
  });
});

describe('invalid requests', () => {
  it('rejects missing signature headers with 400', async () => {
    const body = JSON.stringify(conversationCreated());
    const res = await post(body, { 'content-type': 'application/json' });
    expect(res.status).toBe(400);
  });

  it('rejects a bad signature', async () => {
    const body = JSON.stringify(conversationCreated());
    const res = await post(body, signedHeaders(body, { signature: 'v1,aW52YWxpZA==' }));
    expect(res.status).toBe(400);
  });

  it("rejects a signature made with another endpoint's secret", async () => {
    const other = 'whsec_' + Buffer.from('another-endpoint-secret-01234567').toString('base64');
    const body = JSON.stringify(conversationCreated());
    const res = await post(body, signedHeaders(body, { secret: other }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(conversationCreated());
    const headers = signedHeaders(body);
    const res = await post(body.replace('pro', 'enterprise'), headers);
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp outside the 5-minute tolerance', async () => {
    const body = JSON.stringify(conversationCreated());
    const res = await post(body, signedHeaders(body, { timestamp: now() - 600 }));
    expect(res.status).toBe(400);
  });
});

describe('fail closed', () => {
  it('returns 500 when ADA_WEBHOOK_SECRET is not set', async () => {
    delete process.env.ADA_WEBHOOK_SECRET;
    const body = JSON.stringify(conversationCreated());
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
  });
});
