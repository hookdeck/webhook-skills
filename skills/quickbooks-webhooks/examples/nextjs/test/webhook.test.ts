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

// Exact bodies of two live test deliveries from the Intuit Developer portal's
// "Send test events" (November 2026), one per payload format. The real verifier token
// isn't recorded, so the tests sign these bytes with the test token.
const CAPTURED_LEGACY_BODY =
  '{"eventNotifications":[{"realmId":"310687","dataChangeEvent":{"entities":[{"id":"1234","operation":"Create","name":"Account","lastUpdated":"2026-11-18T16:08:22.702Z"}]}}]}';
const CAPTURED_CLOUDEVENTS_BODY =
  '[{"specversion":"1.0","id":"fb16f042-7faa-4897-b9a2-bed048bc3078","source":"intuit.dsnBgbseACLLRZNxo2dfc4evmEJdxde58xeeYcZliOU=","type":"qbo.invoice.created.v1","datacontenttype":"application/json","time":"2026-11-18T16:10:06.261845232Z","intuitentityid":"1234","intuitaccountid":"310687","data":{}}]';

function makeRequest(
  body: string,
  signature?: string,
  contentType = 'application/json; charset=utf-8'
): NextRequest {
  const headers: Record<string, string> = { 'content-type': contentType };
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
    const res = await POST(makeRequest(JSON.stringify([cloudEvent('qbo.account.created.v1')])));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await POST(makeRequest(JSON.stringify([cloudEvent('qbo.account.created.v1')]), 'aW52YWxpZA=='));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid signature' });
  });

  it('returns 400 for a hex-encoded signature', async () => {
    const body = JSON.stringify([cloudEvent('qbo.account.created.v1')]);
    const hex = crypto.createHmac('sha256', verifierToken).update(body).digest('hex');
    const res = await POST(makeRequest(body, hex));
    expect(res.status).toBe(400);
  });

  it('returns 400 when signed with the wrong verifier token', async () => {
    const body = JSON.stringify([cloudEvent('qbo.account.created.v1')]);
    const res = await POST(makeRequest(body, generateQuickBooksSignature(body, 'other_token')));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a tampered body', async () => {
    const original = JSON.stringify([cloudEvent('qbo.account.created.v1', { intuitentityid: '1' })]);
    const tampered = original.replace('"intuitentityid":"1"', '"intuitentityid":"2"');
    const res = await POST(makeRequest(tampered, generateQuickBooksSignature(original, verifierToken)));
    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid CloudEvents notification', async () => {
    const res = await POST(signedRequest(JSON.stringify([cloudEvent('qbo.account.created.v1')])));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, count: 1 });
  });

  it('accepts the captured CloudEvents array sent as application/cloudevents-batch+json', async () => {
    const res = await POST(
      makeRequest(
        CAPTURED_CLOUDEVENTS_BODY,
        generateQuickBooksSignature(CAPTURED_CLOUDEVENTS_BODY, verifierToken),
        'application/cloudevents-batch+json; charset=utf-8'
      )
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, count: 1 });
  });

  it('accepts the captured legacy body sent as application/json', async () => {
    const res = await POST(signedRequest(CAPTURED_LEGACY_BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, count: 1 });
  });

  it('returns 400 for a validly signed single CloudEvent object (not an array)', async () => {
    const res = await POST(signedRequest(JSON.stringify(JSON.parse(CAPTURED_CLOUDEVENTS_BODY)[0])));
    expect(res.status).toBe(400);
  });

  it.each(['Delete', 'Void', 'Emailed'])('accepts a legacy %s operation', async (operation) => {
    const body = JSON.stringify({
      eventNotifications: [
        {
          realmId: '310687',
          dataChangeEvent: {
            entities: [{ name: 'Invoice', id: '1', operation, lastUpdated: '2026-11-18T16:08:22.702Z' }],
          },
        },
      ],
    });
    const res = await POST(signedRequest(body));
    expect(res.status).toBe(200);
  });

  it('handles events for multiple companies in one notification', async () => {
    const body = JSON.stringify([
      cloudEvent('qbo.account.created.v1', { intuitaccountid: '111' }),
      cloudEvent('qbo.employee.created.v1', { intuitaccountid: '222' }),
      cloudEvent('qbo.customer.merged.v1', { intuitaccountid: '333', data: { deletedid: '27' } }),
    ]);
    const res = await POST(signedRequest(body));
    expect(res.status).toBe(200);
    expect((await res.json()).count).toBe(3);
  });

  it.each([
    'qbo.account.created.v1',
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
    const body = '[ {"type": "qbo.account.created.v1", "intuitentityid": "1", "intuitaccountid": "2"} ]';
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
