import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const TEST_SECRET = 'thisisthesamplekeyfortestingpurposes';
process.env.ZOHO_SIGN_WEBHOOK_SECRET = TEST_SECRET;

import { POST } from '../app/webhooks/zoho-sign/route';
import { verifyZohoSignSignature } from '../lib/zoho-sign';

// Sign exactly like Zoho Sign: base64(HMAC-SHA256(secret as UTF-8, raw body))
function sign(body: string, secret: string = TEST_SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('base64');
}

function payload(operationType: string): string {
  return JSON.stringify({
    notifications: {
      performed_by_email: 'testuser@zoho.com',
      performed_at: 1555062604837,
      reason: 'reason given if any',
      activity: 'Document has been signed',
      operation_type: operationType,
      action_id: '1000000000090',
      performed_by_name: 'test user',
      ip_address: '192.168.100.100',
    },
    requests: {
      request_name: 'NDA Document',
      request_id: '1000000000000',
      org_id: '9876543210',
      request_type_id: '10000000011',
      document_ids: [{ document_name: 'CommonNDA.pdf', document_id: '100000000000050' }],
    },
  });
}

function buildRequest(body: string, headers: Record<string, string> = {}, contentType = 'application/json') {
  return new NextRequest('http://localhost:3000/webhooks/zoho-sign', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('verifyZohoSignSignature', () => {
  // Published sample from Zoho's HMAC doc, including its leading "{{" typo.
  const DOC_BODY =
    '{{"requests":{"request_name":"Test Name"},"notifications":{"operation_type":"RequestSigningSuccess"}}';
  const DOC_SIGNATURE = 'drbSrM4H816RYKpZiRBLddUa0yHaTrwjtY04sIZFZus=';

  it('matches the signature published in the Zoho Sign docs', () => {
    expect(verifyZohoSignSignature(DOC_BODY, DOC_SIGNATURE, TEST_SECRET)).toBe(true);
  });

  it('rejects the docs body without the leading brace', () => {
    expect(verifyZohoSignSignature(DOC_BODY.slice(1), DOC_SIGNATURE, TEST_SECRET)).toBe(false);
  });

  it('does not accept HMAC(payload + secret)', () => {
    const wrong = crypto.createHmac('sha256', TEST_SECRET).update(DOC_BODY + TEST_SECRET).digest('base64');
    expect(verifyZohoSignSignature(DOC_BODY, wrong, TEST_SECRET)).toBe(false);
  });

  it('rejects missing signature or secret and length mismatches', () => {
    expect(verifyZohoSignSignature(DOC_BODY, undefined, TEST_SECRET)).toBe(false);
    expect(verifyZohoSignSignature(DOC_BODY, DOC_SIGNATURE, undefined)).toBe(false);
    expect(verifyZohoSignSignature(DOC_BODY, 'short', TEST_SECRET)).toBe(false);
  });
});

describe('POST /webhooks/zoho-sign', () => {
  const events = [
    'RequestSubmitted',
    'RequestViewed',
    'RequestSigningSuccess',
    'RequestCompleted',
    'RequestRejected',
    'RequestRecalled',
    'RequestForwarded',
    'RequestExpired',
  ];

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    process.env.ZOHO_SIGN_WEBHOOK_SECRET = TEST_SECRET;
  });

  it.each(events)('accepts a signed %s event', async (eventType) => {
    const body = payload(eventType);
    const res = await POST(buildRequest(body, { 'x-zs-webhook-signature': sign(body) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies any content type (raw body)', async () => {
    const body = payload('RequestCompleted');
    const res = await POST(buildRequest(body, { 'x-zs-webhook-signature': sign(body) }, 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('accepts an unknown event type once verified', async () => {
    const body = payload('RequestSomethingNew');
    const res = await POST(buildRequest(body, { 'x-zs-webhook-signature': sign(body) }));
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature header', async () => {
    const res = await POST(buildRequest(payload('RequestCompleted')));
    expect(res.status).toBe(400);
  });

  it('rejects an invalid signature', async () => {
    const res = await POST(buildRequest(payload('RequestCompleted'), { 'x-zs-webhook-signature': sign('other') }));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = payload('RequestCompleted');
    const res = await POST(buildRequest(body, { 'x-zs-webhook-signature': sign(body, 'wrong_secret') }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = payload('RequestCompleted');
    const res = await POST(
      buildRequest(body.replace('NDA Document', 'Evil'), { 'x-zs-webhook-signature': sign(body) })
    );
    expect(res.status).toBe(400);
  });

  it('rejects a validly signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await POST(buildRequest(body, { 'x-zs-webhook-signature': sign(body) }, 'text/plain'));
    expect(res.status).toBe(400);
  });

  it('fails closed when the secret is not configured', async () => {
    delete process.env.ZOHO_SIGN_WEBHOOK_SECRET;
    const body = payload('RequestCompleted');
    const res = await POST(buildRequest(body, { 'x-zs-webhook-signature': sign(body) }));
    expect(res.status).toBe(500);
  });
});
