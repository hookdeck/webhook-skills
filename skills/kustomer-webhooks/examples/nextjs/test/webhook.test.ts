import crypto from 'crypto';
import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';

// Kustomer's webhook token; any string works for tests.
const SECRET = 'test_kustomer_webhook_token';

let POST: (request: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.KUSTOMER_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/kustomer/route'));
});

function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function makeEvent(name: string, id = 'evt_' + Math.random().toString(36).slice(2)): string {
  return JSON.stringify({
    id,
    name,
    org: '5f8481c6a22ab5b9d5f2dd8a',
    orgName: 'org-name',
    data: { type: 'customer', id: '608732dc0ac6b300195d5fb5', attributes: { name: 'Franz Kafka' } },
    createdAt: '2021-04-26T21:38:36.418Z',
    changes: null,
    persist: true,
  });
}

function makeRequest(body: string, signature?: string, contentType = 'application/json'): NextRequest {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature !== undefined) headers['x-kustomer-webhook-signature'] = signature;
  return new NextRequest('http://localhost/webhooks/kustomer', { method: 'POST', headers, body });
}

describe('Kustomer webhook', () => {
  const events = [
    'kustomer.conversation.create',
    'kustomer.conversation.update',
    'kustomer.customer.create',
    'kustomer.customer.update',
    'kustomer.message.create',
    'kustomer.message.update',
  ];

  it.each(events)('accepts a valid %s event', async (name) => {
    const body = makeEvent(name);
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect((await res.json()).received).toBe(true);
  });

  it('accepts unknown event names with a valid signature', async () => {
    const body = makeEvent('kustomer.team.create');
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
  });

  it('verifies regardless of content type', async () => {
    const body = makeEvent('kustomer.customer.create');
    const res = await POST(makeRequest(body, sign(body), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature', async () => {
    const res = await POST(makeRequest(makeEvent('kustomer.customer.create')));
    expect(res.status).toBe(400);
  });

  it('rejects an invalid signature', async () => {
    const body = makeEvent('kustomer.customer.create');
    const res = await POST(makeRequest(body, sign(body, 'wrong_secret')));
    expect(res.status).toBe(400);
  });

  it('rejects a signature of the wrong length', async () => {
    const res = await POST(makeRequest(makeEvent('kustomer.customer.create'), 'abc123'));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = makeEvent('kustomer.customer.create');
    const res = await POST(makeRequest(body.replace('Kafka', 'Samsa'), sign(body)));
    expect(res.status).toBe(400);
  });

  it('rejects invalid JSON that is correctly signed', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, sign(body), 'text/plain'));
    expect(res.status).toBe(400);
  });

  it('flags duplicate event ids', async () => {
    const body = makeEvent('kustomer.message.create', 'evt_dup');
    const first = await (await POST(makeRequest(body, sign(body)))).json();
    const second = await (await POST(makeRequest(body, sign(body)))).json();
    expect(first.duplicate).toBeUndefined();
    expect(second.duplicate).toBe(true);
  });
});
