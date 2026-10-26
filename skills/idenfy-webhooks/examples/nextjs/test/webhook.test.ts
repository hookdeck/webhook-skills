import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/idenfy/route';
import { verifyIdenfySignature } from '../lib/verify-idenfy';

const SECRET = 'test_idenfy_signing_key_0123456789';

beforeAll(() => {
  process.env.IDENFY_WEBHOOK_SECRET = SECRET;
});

function samplePayload(overrides: Record<string, unknown> = {}) {
  return { scanRef: 'scan-1', clientId: 'client-1', final: true, status: { overall: 'APPROVED' }, ...overrides };
}

// Idenfy-Signature = lowercase hex HMAC-SHA256 of the raw body, keyed with the signing key
function sign(body: string | Buffer, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function makeRequest(
  body: string,
  signature?: string,
  eventType = 'IDENTIFICATION_AUTO_FINISHED',
  contentType = 'application/json'
) {
  const headers: Record<string, string> = { 'content-type': contentType, 'idenfy-event-type': eventType };
  if (signature !== undefined) headers['idenfy-signature'] = signature;
  return new NextRequest('http://localhost:3000/webhooks/idenfy', { method: 'POST', headers, body });
}

describe('POST /webhooks/idenfy', () => {
  it('accepts a valid signature', async () => {
    const body = JSON.stringify(samplePayload());
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts an uppercase hex signature', async () => {
    const body = JSON.stringify(samplePayload());
    const res = await POST(makeRequest(body, sign(body).toUpperCase()));
    expect(res.status).toBe(200);
  });

  it('verifies regardless of content type', async () => {
    const body = JSON.stringify(samplePayload());
    const res = await POST(makeRequest(body, sign(body), 'IDENTIFICATION_AUTO_FINISHED', 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('verifies the exact bytes received, including odd whitespace', async () => {
    const body = '{ "scanRef" :   "scan-1" }\n';
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
  });

  it('rejects a wrong-secret signature', async () => {
    const body = JSON.stringify(samplePayload());
    const res = await POST(makeRequest(body, sign(body, 'wrong_secret')));
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const res = await POST(
      makeRequest(JSON.stringify(samplePayload({ scanRef: 'scan-2' })), sign(JSON.stringify(samplePayload())))
    );
    expect(res.status).toBe(401);
  });

  it('rejects a missing signature', async () => {
    const res = await POST(makeRequest(JSON.stringify(samplePayload())));
    expect(res.status).toBe(401);
  });

  it('rejects malformed signatures', async () => {
    const body = JSON.stringify(samplePayload());
    const good = sign(body);
    for (const bad of ['', 'abc', good.slice(0, 62), good + '00', 'z'.repeat(64), `sha256=${good}`, good.slice(0, 62) + 'zz']) {
      const res = await POST(makeRequest(body, bad));
      expect(res.status).toBe(401);
    }
  });

  it('returns 400 for invalid JSON after verifying the signature', async () => {
    const res = await POST(makeRequest('not json', sign('not json')));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    const res = await POST(makeRequest('[1,2]', sign('[1,2]')));
    expect(res.status).toBe(400);
  });

  it.each([
    'IDENTIFICATION_AUTO_FINISHED',
    'IDENTIFICATION_MANUAL_FINISHED',
    'IDENTIFICATION_EXPIRED',
    'IDENTIFICATION_CANCELLED',
    'COMPANY_REVIEW',
    'AML_MONITORING',
    'FACIAL_AUTHENTICATION',
  ])('returns 200 for %s', async (eventType) => {
    const body = JSON.stringify(samplePayload());
    const res = await POST(makeRequest(body, sign(body), eventType));
    expect(res.status).toBe(200);
  });
});

describe('verifyIdenfySignature', () => {
  const body = Buffer.from(JSON.stringify(samplePayload()));

  it('accepts a matching signature', () => {
    expect(verifyIdenfySignature(body, sign(body), SECRET)).toBe(true);
  });

  it('rejects when no secret is configured', () => {
    expect(verifyIdenfySignature(body, sign(body, ''), '')).toBe(false);
  });

  it('rejects null and non-ASCII signatures without throwing', () => {
    expect(verifyIdenfySignature(body, null, SECRET)).toBe(false);
    expect(verifyIdenfySignature(body, 'é'.repeat(64), SECRET)).toBe(false);
  });
});
