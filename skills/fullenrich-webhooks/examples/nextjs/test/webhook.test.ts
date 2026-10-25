import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { verifyFullEnrichSignature } from '../lib/verify-fullenrich';
import { POST } from '../app/webhooks/fullenrich/route';

// FullEnrich signs with your API key (no separate webhook secret)
const API_KEY = 'test_fullenrich_api_key';

beforeEach(() => {
  process.env.FULLENRICH_API_KEY = API_KEY;
});

/**
 * Sign like FullEnrich: lowercase hex(HMAC-SHA1(apiKey, rawBody))
 */
function sign(body: string, key = API_KEY): string {
  return crypto.createHmac('sha1', key).update(body, 'utf8').digest('hex');
}

function makeRequest(body: string, signature?: string, contentType = 'application/json'): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': contentType };
  if (signature) headers['X-Signature-SHA1'] = signature;
  return new Request('http://localhost/webhooks/fullenrich', {
    method: 'POST',
    headers,
    body,
  }) as unknown as NextRequest;
}

const batchPayload = JSON.stringify({
  id: 'enr_123',
  name: 'My Enrichment',
  status: 'FINISHED',
  cost: { credits: 10 },
  data: [{ custom: { user_id: '12584' }, contact_info: {} }],
});

const contactPayload = JSON.stringify({
  id: 'enr_123',
  status: 'IN_PROGRESS',
  data: [{ custom: {}, contact_info: {} }],
});

describe('verifyFullEnrichSignature', () => {
  it('accepts a valid signature', () => {
    expect(verifyFullEnrichSignature(batchPayload, sign(batchPayload), API_KEY)).toBe(true);
  });

  it('accepts an uppercase hex signature', () => {
    expect(verifyFullEnrichSignature(batchPayload, sign(batchPayload).toUpperCase(), API_KEY)).toBe(true);
  });

  it('rejects a wrong key or modified body', () => {
    expect(verifyFullEnrichSignature(batchPayload, sign(batchPayload, 'other'), API_KEY)).toBe(false);
    expect(verifyFullEnrichSignature(batchPayload + ' ', sign(batchPayload), API_KEY)).toBe(false);
  });

  it('rejects non-hex, short and non-ASCII signatures', () => {
    expect(verifyFullEnrichSignature(batchPayload, 'z'.repeat(40), API_KEY)).toBe(false);
    expect(verifyFullEnrichSignature(batchPayload, sign(batchPayload).slice(0, 20), API_KEY)).toBe(false);
    expect(verifyFullEnrichSignature(batchPayload, 'é'.repeat(40), API_KEY)).toBe(false);
  });

  it('rejects a SHA-256 signature', () => {
    const sha256 = crypto.createHmac('sha256', API_KEY).update(batchPayload).digest('hex');
    expect(verifyFullEnrichSignature(batchPayload, sha256, API_KEY)).toBe(false);
  });
});

describe('POST /webhooks/fullenrich', () => {
  it('accepts a signed batch result', async () => {
    const res = await POST(makeRequest(batchPayload, sign(batchPayload)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts a signed contact_finished result', async () => {
    const res = await POST(makeRequest(contactPayload, sign(contactPayload)));
    expect(res.status).toBe(200);
  });

  it('verifies any content type', async () => {
    const res = await POST(makeRequest(batchPayload, sign(batchPayload), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 400 when the signature header is missing', async () => {
    const res = await POST(makeRequest(batchPayload));
    expect(res.status).toBe(400);
  });

  it('returns 401 for an invalid signature', async () => {
    const res = await POST(makeRequest(batchPayload, sign(batchPayload, 'wrong')));
    expect(res.status).toBe(401);
  });

  it('returns 400 for signed invalid JSON', async () => {
    const bad = '{not json';
    const res = await POST(makeRequest(bad, sign(bad)));
    expect(res.status).toBe(400);
  });
});
