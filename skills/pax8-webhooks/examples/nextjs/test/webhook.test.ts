import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/pax8/route';
import { classify, verifyPax8Request } from '../lib/verify-pax8';

const SECRET = 'Bearer 7d9f3c1e-5b2a-4e8d-9a60-c1d2e3f40516';

beforeAll(() => {
  process.env.PAX8_AUTHORIZATION = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

// Illustrative payloads: the field names follow the WebhookPayload schema in Pax8's
// Webhooks API reference; the values are placeholders, and payloadData is left empty
// because its fields aren't documented.
function notification(topic, action, n) {
  return {
    accountId: '00000000-0000-0000-0000-00000000000a',
    url: 'https://example.com/webhooks/pax8',
    webhookId: '00000000-0000-0000-0000-00000000000b',
    sentAt: '2026-01-01T00:00:00Z',
    webhookTopic: {
      id: `00000000-0000-0000-0000-00000000000${n}`,
      topic,
      filters: [{ action, conditions: [] }],
    },
    payloadData: {},
  };
}
const subscriptionCreate = notification('SUBSCRIPTION', 'CREATE', 1);
const invoiceCreate = notification('INVOICE', 'CREATED', 2);

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(subscriptionCreate),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/pax8', {
    method: 'POST',
    headers: { 'Content-Type': contentType, ...headers },
    body,
  });
}

describe('Pax8 webhook route', () => {
  it('accepts the full Authorization header value', async () => {
    const res = await POST(makeRequest({ Authorization: SECRET }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('rejects a missing Authorization header', async () => {
    expect((await POST(makeRequest())).status).toBe(401);
  });

  it('rejects a wrong value', async () => {
    expect((await POST(makeRequest({ Authorization: 'Bearer wrong-value' }))).status).toBe(401);
  });

  it('rejects the value without its "Bearer " prefix', async () => {
    const res = await POST(makeRequest({ Authorization: SECRET.replace('Bearer ', '') }));
    expect(res.status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await POST(makeRequest({ Authorization: SECRET }, JSON.stringify(invoiceCreate), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await POST(makeRequest({ Authorization: SECRET }, 'not json'))).status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    expect((await POST(makeRequest({ Authorization: SECRET }, '[1,2]'))).status).toBe(400);
  });

  it('accepts a payload without a topic', async () => {
    expect((await POST(makeRequest({ Authorization: SECRET }, '{"foo":1}'))).status).toBe(200);
  });
});

describe('helpers', () => {
  it('reads the topic from webhookTopic.topic', () => {
    expect(classify(subscriptionCreate)).toEqual({ topic: 'SUBSCRIPTION', sentAt: '2026-01-01T00:00:00Z' });
    expect(classify({ webhookTopic: { topic: 'invoice' } })).toEqual({ topic: 'INVOICE', sentAt: null });
    expect(classify({ topic: 'SUBSCRIPTION' })).toEqual({ topic: null, sentAt: null });
    expect(classify({ webhookTopic: { topic: 5 } })).toEqual({ topic: null, sentAt: null });
  });

  it('compares the whole value for a bare (prefix-less) secret', () => {
    const cfg = { PAX8_AUTHORIZATION: 'my_super_secret' };
    expect(verifyPax8Request(new Headers({ Authorization: 'my_super_secret' }), cfg)).toBe(true);
    expect(verifyPax8Request(new Headers({ Authorization: 'Bearer my_super_secret' }), cfg)).toBe(false);
  });

  it('never accepts when PAX8_AUTHORIZATION is unset', () => {
    expect(verifyPax8Request(new Headers({ Authorization: 'Bearer x' }), {})).toBe(false);
    expect(verifyPax8Request(new Headers({ Authorization: '' }), { PAX8_AUTHORIZATION: '' })).toBe(false);
  });
});
