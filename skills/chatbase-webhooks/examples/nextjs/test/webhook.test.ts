import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import {
  verifyChatbaseSignature,
  verifyChatbaseHipaaSignature,
  parseEventType,
} from '../lib/verify-chatbase';
import { POST } from '../app/webhooks/chatbase/route';
import { POST as POST_HIPAA } from '../app/webhooks/chatbase-hipaa/route';

// Event webhook secret: any string; Chatbase's own sample reads it from SECRET_KEY
const SECRET = 'test_chatbase_webhook_secret';
// HIPAA signing secrets are 64-character hex strings, used as-is (UTF-8) as the HMAC key
const HIPAA_SECRET = 'a'.repeat(32) + 'b'.repeat(32);

beforeEach(() => {
  process.env.CHATBASE_WEBHOOK_SECRET = SECRET;
  process.env.CHATBASE_HIPAA_WEBHOOK_SECRET = HIPAA_SECRET;
});

/** Sign like Chatbase event webhooks: hex(HMAC-SHA1(secret, rawBody)) */
function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha1', secret).update(body, 'utf8').digest('hex');
}

/** Sign like the HIPAA webhook: "v1=" + hex(HMAC-SHA256(secret, `${ts}.${body}`)) */
function signHipaa(body: string, timestamp: string, secret = HIPAA_SECRET): string {
  return 'v1=' + crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex');
}

const now = () => String(Math.floor(Date.now() / 1000));

function makeRequest(path: string, body: string, headers: Record<string, string | undefined> = {}): NextRequest {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  for (const [k, v] of Object.entries(headers)) if (v) h[k] = v;
  return new Request(`http://localhost${path}`, { method: 'POST', headers: h, body }) as unknown as NextRequest;
}

const leadEvent = {
  eventType: 'leads.submit',
  chatbotId: 'agent_123',
  payload: {
    conversationId: 'conv_456',
    customerEmail: 'example@chatbase.co',
    customerName: 'Example',
    customerPhone: '123',
    customFields: { 'Company name': 'Acme', 'Team size': 12, utm_source: 'google' },
  },
};

const phoneEvent = {
  eventType: 'phone_call.summary',
  chatbotId: 'agent_123',
  payload: {
    conversationId: 'conv_789',
    callSummary: 'Caller asked about opening hours.',
    duration: 94,
    callerNumber: '+14155550100',
    calledNumber: '+14155550199',
  },
};

const formEvent = {
  eventType: 'Book demo_custom_form.submit',
  chatbotId: 'agent_123',
  payload: { conversationId: 'conv_1', data: { email: 'a@b.co' }, error: null },
};

const collectEvent = {
  eventType: 'Shipping address_collect_data.submit',
  chatbotId: 'agent_123',
  payload: { conversationId: 'conv_2', customFields: { City: 'Paris' } },
};

const hipaaEvent = {
  deliveryId: 'b7c1e0a4-3f52-4d81-9a6c-2e4f8d0b1c73',
  event: 'conversation.deleted',
  deletedAt: '2026-08-17T03:00:00.000Z',
  deletionReason: 'idle_24h',
  conversation: {
    id: 'd41f8a92-6b3c-4e17-8f5a-9c0d2b7e4a16',
    chatbotId: 'c8e2f1b6-5a94-4d03-b7e8-1f6a3c9d0e52',
    messages: [{ id: 'msg_1', role: 'user', content: 'Hi' }],
  },
};

describe('verifyChatbaseSignature', () => {
  const body = JSON.stringify(leadEvent);

  it('accepts a valid HMAC-SHA1 hex signature over the raw body', () => {
    expect(verifyChatbaseSignature(body, sign(body), SECRET)).toBe(true);
  });

  it('produces a bare 40-char hex digest (no prefix)', () => {
    expect(sign(body)).toMatch(/^[a-f0-9]{40}$/);
  });

  it('rejects a tampered body, wrong secret, and SHA-256', () => {
    expect(verifyChatbaseSignature(body.replace('Example', 'Evil'), sign(body), SECRET)).toBe(false);
    expect(verifyChatbaseSignature(body, sign(body, 'other_secret'), SECRET)).toBe(false);
    const sha256 = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
    expect(verifyChatbaseSignature(body, sha256, SECRET)).toBe(false);
  });

  it('rejects missing signature or secret', () => {
    expect(verifyChatbaseSignature(body, null, SECRET)).toBe(false);
    expect(verifyChatbaseSignature(body, sign(body), undefined)).toBe(false);
  });
});

describe('verifyChatbaseHipaaSignature', () => {
  const body = JSON.stringify(hipaaEvent);

  it('accepts a valid v1= signature over timestamp.body', () => {
    const ts = now();
    expect(verifyChatbaseHipaaSignature(body, signHipaa(body, ts), ts, HIPAA_SECRET)).toEqual({ ok: true });
  });

  it('rejects a signature without the v1= prefix or over the body alone', () => {
    const ts = now();
    expect(verifyChatbaseHipaaSignature(body, signHipaa(body, ts).slice(3), ts, HIPAA_SECRET).ok).toBe(false);
    const bodyOnly = 'v1=' + crypto.createHmac('sha256', HIPAA_SECRET).update(body).digest('hex');
    expect(verifyChatbaseHipaaSignature(body, bodyOnly, ts, HIPAA_SECRET).ok).toBe(false);
  });

  it('rejects stale and non-numeric timestamps', () => {
    const old = String(Math.floor(Date.now() / 1000) - 301);
    expect(verifyChatbaseHipaaSignature(body, signHipaa(body, old), old, HIPAA_SECRET)).toEqual({
      ok: false,
      error: 'stale_timestamp',
    });
    expect(verifyChatbaseHipaaSignature(body, signHipaa(body, 'abc'), 'abc', HIPAA_SECRET)).toEqual({
      ok: false,
      error: 'stale_timestamp',
    });
  });

  it('reports missing headers separately', () => {
    expect(verifyChatbaseHipaaSignature(body, null, now(), HIPAA_SECRET)).toEqual({ ok: false, error: 'missing_headers' });
    expect(verifyChatbaseHipaaSignature(body, 'v1=x', null, HIPAA_SECRET)).toEqual({ ok: false, error: 'missing_headers' });
  });
});

describe('parseEventType', () => {
  it('parses fixed and Action-named event types', () => {
    expect(parseEventType('leads.submit')).toEqual({ kind: 'leads.submit' });
    expect(parseEventType('phone_call.summary')).toEqual({ kind: 'phone_call.summary' });
    expect(parseEventType('Book demo_custom_form.submit')).toEqual({ kind: 'custom_form.submit', actionName: 'Book demo' });
    expect(parseEventType('Shipping address_collect_data.submit')).toEqual({
      kind: 'collect_data.submit',
      actionName: 'Shipping address',
    });
    expect(parseEventType('_custom_form.submit')).toEqual({ kind: 'unknown' });
    expect(parseEventType('something.else')).toEqual({ kind: 'unknown' });
  });
});

describe('POST /webhooks/chatbase', () => {
  const post = (body: string, signature?: string) =>
    POST(makeRequest('/webhooks/chatbase', body, { 'x-chatbase-signature': signature }));

  it('returns 400 when x-chatbase-signature is missing', async () => {
    const res = await post(JSON.stringify(leadEvent));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing x-chatbase-signature header' });
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await post(JSON.stringify(leadEvent), 'a'.repeat(40));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid signature' });
  });

  it.each([
    [leadEvent, 'leads.submit'],
    [phoneEvent, 'phone_call.summary'],
    [formEvent, 'custom_form.submit'],
    [collectEvent, 'collect_data.submit'],
  ] as const)('accepts signed event %#: %s', async (event, kind) => {
    const body = JSON.stringify(event);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, eventType: event.eventType, kind });
  });

  it('acknowledges unknown event types', async () => {
    const body = JSON.stringify({ eventType: 'new.event', chatbotId: 'x', payload: {} });
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect((await res.json()).kind).toBe('unknown');
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const res = await post('not json', sign('not json'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON' });
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.CHATBASE_WEBHOOK_SECRET;
    const body = JSON.stringify(leadEvent);
    const res = await post(body, sign(body));
    expect(res.status).toBe(500);
  });
});

describe('POST /webhooks/chatbase-hipaa', () => {
  const post = (body: string, signature?: string, timestamp?: string) =>
    POST_HIPAA(
      makeRequest('/webhooks/chatbase-hipaa', body, {
        'X-Chatbase-Signature': signature,
        'X-Chatbase-Timestamp': timestamp,
      })
    );

  it('accepts a signed conversation.deleted delivery', async () => {
    const body = JSON.stringify(hipaaEvent);
    const ts = now();
    const res = await post(body, signHipaa(body, ts), ts);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, event: 'conversation.deleted' });
  });

  it('acknowledges the signed verification probe without processing it', async () => {
    const body = JSON.stringify({ ...hipaaEvent, test: true });
    const ts = now();
    const res = await post(body, signHipaa(body, ts), ts);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, test: true });
  });

  it('rejects the probe signed with a throwaway key (non-2xx)', async () => {
    const body = JSON.stringify({ ...hipaaEvent, deliveryId: 'other', test: true });
    const ts = now();
    const res = await post(body, signHipaa(body, ts, crypto.randomBytes(32).toString('hex')), ts);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_signature' });
  });

  it('returns 400 for missing headers and stale timestamps', async () => {
    const body = JSON.stringify(hipaaEvent);
    expect((await post(body)).status).toBe(400);
    const old = String(Math.floor(Date.now() / 1000) - 600);
    const res = await post(body, signHipaa(body, old), old);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'stale_timestamp' });
  });
});
