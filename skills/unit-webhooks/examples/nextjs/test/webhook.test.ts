import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const TOKEN = 'test_unit_webhook_token';

// Matches Unit: base64 HMAC-SHA1 of the raw body, keyed by the webhook token.
function sign(body: string, token = TOKEN): string {
  return crypto.createHmac('sha1', token).update(body).digest('base64');
}

function eventBody(type: string, id = '269'): string {
  return JSON.stringify({
    data: [
      {
        id,
        type,
        attributes: { createdAt: '2021-04-13T07:40:43.813Z' },
        relationships: { account: { data: { id: '10004', type: 'account' } } },
      },
    ],
  });
}

function makeRequest(body: string, signature?: string, contentType = 'application/vnd.api+json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature !== undefined) headers['x-unit-signature'] = signature;
  return new NextRequest('http://localhost:3000/webhooks/unit', {
    method: 'POST',
    headers,
    body,
  });
}

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.UNIT_WEBHOOK_TOKEN = TOKEN;
  ({ POST } = await import('../app/webhooks/unit/route'));
});

describe('Unit webhook', () => {
  it.each([
    'account.created',
    'customer.created',
    'transaction.created',
    'payment.clearing',
    'application.approved',
  ])('accepts a valid %s event', async (type) => {
    const body = eventBody(type);
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies regardless of content type', async () => {
    const body = eventBody('account.created');
    for (const ct of ['application/json', 'text/plain']) {
      const res = await POST(makeRequest(body, sign(body), ct));
      expect(res.status).toBe(200);
    }
  });

  it('accepts a batched delivery with several events', async () => {
    const body = JSON.stringify({
      data: [
        { id: '1', type: 'customer.created', attributes: {}, relationships: {} },
        { id: '2', type: 'account.created', attributes: {}, relationships: {} },
      ],
    });
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
  });

  it('accepts unknown event types', async () => {
    const body = eventBody('somethingNew.happened');
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
  });

  it('rejects an invalid signature', async () => {
    const body = eventBody('account.created');
    const res = await POST(makeRequest(body, sign(body, 'wrong_token')));
    expect(res.status).toBe(400);
  });

  it('rejects a signature that differs in length', async () => {
    const body = eventBody('account.created');
    const res = await POST(makeRequest(body, 'short'));
    expect(res.status).toBe(400);
  });

  it('rejects a missing signature header', async () => {
    const body = eventBody('account.created');
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
  });

  it('rejects a body modified after signing', async () => {
    const body = eventBody('account.created');
    const res = await POST(makeRequest(body.replace('269', '999'), sign(body)));
    expect(res.status).toBe(400);
  });

  it('rejects a validly signed but malformed JSON body', async () => {
    const body = '{not json';
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(400);
  });
});
