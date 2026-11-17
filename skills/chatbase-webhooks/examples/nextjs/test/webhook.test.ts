import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { verifyChatbaseSignature, parseEventType } from '../lib/verify-chatbase';
import { POST } from '../app/webhooks/chatbase/route';

// Test secret only. Chatbase's docs don't say where the Action webhook secret is shown.
const SECRET = 'test_chatbase_webhook_secret';

beforeEach(() => {
  process.env.CHATBASE_WEBHOOK_SECRET = SECRET;
});

/** Sign like Chatbase Action webhooks: hex(HMAC-SHA1(secret, rawBody)) */
function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha1', secret).update(body, 'utf8').digest('hex');
}

function makeRequest(body: string, headers: Record<string, string | undefined> = {}): NextRequest {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  for (const [k, v] of Object.entries(headers)) if (v) h[k] = v;
  return new Request('http://localhost/webhooks/chatbase', { method: 'POST', headers: h, body }) as unknown as NextRequest;
}

// The leads.submit body Chatbase's webhook guide prints (placeholder values).
const leadEvent = {
  eventType: 'leads.submit',
  chatbotId: 'xxxxxxxx',
  payload: {
    conversationId: 'xxxxxxxx',
    customerEmail: 'example@chatbase.co',
    customerName: 'Example',
    customerPhone: '123',
    customFields: { 'Company name': 'Acme', 'Team size': 12, utm_source: 'google', utm_campaign: 'spring_sale' },
  },
};

// The fixtures below are illustrative: the guide documents these payloads as field shapes only.
const phoneEvent = {
  eventType: 'phone_call.summary',
  chatbotId: 'agent_123',
  payload: {
    conversationId: 'conv_789',
    callSummary: 'Example summary',
    duration: 94,
    callerNumber: '+15555550100',
    calledNumber: '+15555550199',
  },
};

// "Book demo" and "Shipping address" are example Action names.
const formEvent = {
  eventType: 'Book demo_custom_form.submit',
  chatbotId: 'agent_123',
  payload: { conversationId: 'conv_1', data: { field: 'value' }, error: null },
};

const collectEvent = {
  eventType: 'Shipping address_collect_data.submit',
  chatbotId: 'agent_123',
  payload: { conversationId: 'conv_2', customFields: { field: 'value' } },
};

describe('verifyChatbaseSignature', () => {
  const body = JSON.stringify(leadEvent);
  const raw = Buffer.from(body, 'utf8');

  it('accepts a valid HMAC-SHA1 hex signature over the raw body', () => {
    expect(verifyChatbaseSignature(raw, sign(body), SECRET)).toBe(true);
  });

  it('accepts uppercase hex', () => {
    expect(verifyChatbaseSignature(raw, sign(body).toUpperCase(), SECRET)).toBe(true);
  });

  it('produces a bare 40-char hex digest (no prefix)', () => {
    expect(sign(body)).toMatch(/^[a-f0-9]{40}$/);
  });

  it('rejects a tampered body, wrong secret, and SHA-256', () => {
    expect(verifyChatbaseSignature(Buffer.from(body.replace('Example', 'Evil')), sign(body), SECRET)).toBe(false);
    expect(verifyChatbaseSignature(raw, sign(body, 'other_secret'), SECRET)).toBe(false);
    const sha256 = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
    expect(verifyChatbaseSignature(raw, sha256, SECRET)).toBe(false);
  });

  it('rejects a 39-character or non-hex value', () => {
    expect(verifyChatbaseSignature(raw, sign(body).slice(0, 39), SECRET)).toBe(false);
    expect(verifyChatbaseSignature(raw, 'z'.repeat(40), SECRET)).toBe(false);
  });

  it('rejects missing signature or secret', () => {
    expect(verifyChatbaseSignature(raw, null, SECRET)).toBe(false);
    expect(verifyChatbaseSignature(raw, sign(body), undefined)).toBe(false);
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
    expect(parseEventType(42)).toEqual({ kind: 'unknown' });
  });
});

describe('POST /webhooks/chatbase', () => {
  it('returns 400 when x-chatbase-signature is missing', async () => {
    const res = await POST(makeRequest(JSON.stringify(leadEvent)));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Missing x-chatbase-signature header');
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await POST(makeRequest(JSON.stringify(leadEvent), { 'x-chatbase-signature': 'a'.repeat(40) }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  it('returns 400 for the wrong secret or a malformed signature', async () => {
    const body = JSON.stringify(leadEvent);
    expect((await POST(makeRequest(body, { 'x-chatbase-signature': sign(body, 'wrong_secret') }))).status).toBe(400);
    expect((await POST(makeRequest(body, { 'x-chatbase-signature': sign(body).slice(0, 39) }))).status).toBe(400);
    expect((await POST(makeRequest(body, { 'x-chatbase-signature': 'g'.repeat(40) }))).status).toBe(400);
  });

  it('accepts an uppercase hex signature', async () => {
    const body = JSON.stringify(leadEvent);
    const res = await POST(makeRequest(body, { 'x-chatbase-signature': sign(body).toUpperCase() }));
    expect(res.status).toBe(200);
  });

  it.each([
    [leadEvent, 'leads.submit'],
    [phoneEvent, 'phone_call.summary'],
    [formEvent, 'custom_form.submit'],
    [collectEvent, 'collect_data.submit'],
  ])('accepts a signed event %#', async (event, kind) => {
    const body = JSON.stringify(event);
    const res = await POST(makeRequest(body, { 'x-chatbase-signature': sign(body) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, eventType: event.eventType, kind });
  });

  it('acknowledges unknown event types', async () => {
    const body = JSON.stringify({ eventType: 'new.event', chatbotId: 'x', payload: {} });
    const res = await POST(makeRequest(body, { 'x-chatbase-signature': sign(body) }));
    expect(res.status).toBe(200);
    expect((await res.json()).kind).toBe('unknown');
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const res = await POST(makeRequest('not json', { 'x-chatbase-signature': sign('not json') }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid JSON');
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.CHATBASE_WEBHOOK_SECRET;
    const body = JSON.stringify(leadEvent);
    const res = await POST(makeRequest(body, { 'x-chatbase-signature': sign(body) }));
    expect(res.status).toBe(500);
  });
});
