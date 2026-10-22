// Generated with: signnow-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST, verifySignNowSignature } from '../app/webhooks/signnow/route';

// SignNow lets you pick any string (up to 300 chars) as the subscription secret_key.
const SECRET = 'my-signnow-secret-key';

// Same algorithm as SignNow: base64(HMAC-SHA256(secret as UTF-8, raw body)).
function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('base64');
}

function makePayload(event: string, content: Record<string, unknown> = {}) {
  return {
    meta: {
      timestamp: 1728310375,
      event,
      environment: 'https://app.signnow.com/api',
      callback_url: 'https://example.com/webhooks/signnow',
      access_token: '********',
    },
    content,
  };
}

function makeRequest(body: string, signature?: string, contentType = 'application/json'): NextRequest {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature !== undefined) headers['x-signnow-signature'] = signature;
  return new NextRequest('http://localhost:3000/webhooks/signnow', { method: 'POST', headers, body });
}

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv('SIGNNOW_WEBHOOK_SECRET', SECRET);
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('SignNow webhook route', () => {
  test('accepts a valid signature for document.complete', async () => {
    const body = JSON.stringify(makePayload('document.complete', { document_id: 'doc1', document_name: 'NDA' }));
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('document.complete'));
  });

  test('verifies regardless of content type (raw body)', async () => {
    const body = JSON.stringify(makePayload('document.update', { document_id: 'doc1' }));
    const res = await POST(makeRequest(body, sign(body), 'text/plain'));
    expect(res.status).toBe(200);
  });

  test('rejects an invalid signature', async () => {
    const body = JSON.stringify(makePayload('document.complete', { document_id: 'doc1' }));
    const res = await POST(makeRequest(body, sign(body, 'wrong')));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a body modified after signing', async () => {
    const body = JSON.stringify(makePayload('document.complete', { document_id: 'doc1' }));
    const res = await POST(makeRequest(body.replace('doc1', 'doc2'), sign(body)));
    expect(res.status).toBe(400);
  });

  test('rejects a missing signature header (unsigned delivery)', async () => {
    const body = JSON.stringify(makePayload('document.complete'));
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Missing/);
  });

  test('rejects a hex-encoded signature (must be base64)', async () => {
    const body = JSON.stringify(makePayload('document.complete'));
    const hex = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
    const res = await POST(makeRequest(body, hex));
    expect(res.status).toBe(400);
  });

  test('returns 500 when the secret is not configured', async () => {
    vi.stubEnv('SIGNNOW_WEBHOOK_SECRET', '');
    const body = JSON.stringify(makePayload('document.complete'));
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(500);
  });

  test('returns 400 for a validly signed non-JSON body', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, sign(body), 'text/plain'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid JSON');
  });

  test.each([
    ['document.open', { document_id: 'd' }],
    ['document.update', { document_id: 'd' }],
    ['document.delete', { document_id: 'd' }],
    ['document.fieldinvite.sent', { document_id: 'd' }],
    ['document.fieldinvite.signed', { document_id: 'd' }],
    ['document.fieldinvite.decline', { document_id: 'd' }],
    ['user.document.complete', { document_id: 'd', user_id: 'u' }],
    ['document_group.complete', { group_id: 'g' }],
    ['document_group.invite.signer.complete', { group_id: 'g', signer_email: 's@example.com' }],
  ])('handles %s', async (event, content) => {
    const body = JSON.stringify(makePayload(event, content));
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled'));
  });

  test('acknowledges unknown events', async () => {
    const body = JSON.stringify(makePayload('template.copy'));
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Unhandled SignNow event: template.copy'));
  });

  test('verifySignNowSignature handles length mismatch and empty inputs', () => {
    expect(verifySignNowSignature('{}', sign('{}'), SECRET)).toBe(true);
    expect(verifySignNowSignature('{}', 'short', SECRET)).toBe(false);
    expect(verifySignNowSignature('{}', '', SECRET)).toBe(false);
    expect(verifySignNowSignature('{}', sign('{}'), '')).toBe(false);
  });
});
