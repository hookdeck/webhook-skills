import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/quickbooks/route';

// Verifier Tokens are opaque strings used directly as the HMAC key (no prefix, no decoding).
const verifierToken = 'test_verifier_token_0a1b2c3d';

beforeAll(() => {
  process.env.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN = verifierToken;
});

/**
 * Generate a valid intuit-signature: base64(HMAC-SHA256(rawBody, verifierToken))
 */
function generateQuickBooksSignature(payload: string, token: string): string {
  return crypto.createHmac('sha256', token).update(payload, 'utf8').digest('base64');
}

function cloudEvent(type: string, overrides: Record<string, unknown> = {}) {
  return {
    specversion: '1.0',
    id: crypto.randomUUID(),
    source: 'intuit.dsnBgbseACLLRZNxo2dfc4evmEJdxde58xeeYcZliOU=',
    type,
    datacontenttype: 'application/json',
    time: '2026-09-10T21:31:25Z',
    intuitentityid: '1234',
    intuitaccountid: '310687',
    data: {},
    ...overrides,
  };
}

function makeRequest(body: string, signature?: string): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8' };
  if (signature !== undefined) headers['intuit-signature'] = signature;
  return new NextRequest('http://localhost:3000/webhooks/quickbooks', {
    method: 'POST',
    headers,
    body,
  });
}

function signedRequest(body: string): NextRequest {
  return makeRequest(body, generateQuickBooksSignature(body, verifierToken));
}

describe('POST /webhooks/quickbooks', () => {
  it('returns 400 when intuit-signature is missing', async () => {
    const res = await POST(makeRequest(JSON.stringify([cloudEvent('qbo.invoice.created.v1')])));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await POST(makeRequest(JSON.stringify([cloudEvent('qbo.invoice.created.v1')]), 'aW52YWxpZA=='));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid signature' });
  });

  it('returns 400 for a hex-encoded signature', async () => {
    const body = JSON.stringify([cloudEvent('qbo.invoice.created.v1')]);
    const hex = crypto.createHmac('sha256', verifierToken).update(body).digest('hex');
    const res = await POST(makeRequest(body, hex));
    expect(res.status).toBe(400);
  });

  it('returns 400 when signed with the wrong verifier token', async () => {
    const body = JSON.stringify([cloudEvent('qbo.invoice.created.v1')]);
    const res = await POST(makeRequest(body, generateQuickBooksSignature(body, 'other_token')));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a tampered body', async () => {
    const original = JSON.stringify([cloudEvent('qbo.invoice.created.v1', { intuitentityid: '1' })]);
    const tampered = original.replace('"intuitentityid":"1"', '"intuitentityid":"2"');
    const res = await POST(makeRequest(tampered, generateQuickBooksSignature(original, verifierToken)));
    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid CloudEvents notification', async () => {
    const res = await POST(signedRequest(JSON.stringify([cloudEvent('qbo.invoice.created.v1')])));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, count: 1 });
  });

  it('handles events for multiple companies in one notification', async () => {
    const body = JSON.stringify([
      cloudEvent('qbo.invoice.created.v1', { intuitaccountid: '111' }),
      cloudEvent('qbo.payment.created.v1', { intuitaccountid: '222' }),
      cloudEvent('qbo.customer.merged.v1', { intuitaccountid: '333', data: { deletedid: '27' } }),
    ]);
    const res = await POST(signedRequest(body));
    expect(res.status).toBe(200);
    expect((await res.json()).count).toBe(3);
  });

  it.each([
    'qbo.invoice.created.v1',
    'qbo.invoice.updated.v1',
    'qbo.invoice.deleted.v1',
    'qbo.invoice.voided.v1',
    'qbo.invoice.emailed.v1',
    'qbo.payment.created.v1',
    'qbo.customer.created.v1',
    'qbo.customer.updated.v1',
    'qbo.customer.merged.v1',
    'qbo.salesreceipt.updated.v1',
    'qbo.employee.created.v1',
  ])('accepts %s', async (type) => {
    const res = await POST(signedRequest(JSON.stringify([cloudEvent(type)])));
    expect(res.status).toBe(200);
  });

  it('returns 200 for a valid legacy eventNotifications payload', async () => {
    const body = JSON.stringify({
      eventNotifications: [
        {
          realmId: '310687',
          dataChangeEvent: {
            entities: [
              { name: 'Invoice', id: '1', operation: 'Update', lastUpdated: '2025-10-05T14:42:19-0700' },
              { name: 'Customer', id: '2', operation: 'Merge', deletedId: '7', lastUpdated: '2025-10-05T14:42:19-0700' },
            ],
          },
        },
      ],
    });
    const res = await POST(signedRequest(body));
    expect(res.status).toBe(200);
    expect((await res.json()).count).toBe(2);
  });

  it('verifies against the raw bytes, not re-serialized JSON', async () => {
    const body = '[ {"type": "qbo.invoice.created.v1", "intuitentityid": "1", "intuitaccountid": "2"} ]';
    const res = await POST(signedRequest(body));
    expect(res.status).toBe(200);
  });

  it('returns 400 for a validly signed but unrecognized payload', async () => {
    const res = await POST(signedRequest(JSON.stringify({ hello: 'world' })));
    expect(res.status).toBe(400);
  });

  it('returns 400 for validly signed invalid JSON', async () => {
    const res = await POST(signedRequest('not json'));
    expect(res.status).toBe(400);
  });
});
