import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/simpro/route';
import { verifySimproSignature } from '../lib/verify-simpro';

// Simpro secrets are any string you choose on the subscription
const SECRET = 'test_simpro_secret_long_random_value';

/** Sign like Simpro: lowercase hex HMAC-SHA1 of the raw body */
function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha1', secret).update(body).digest('hex');
}

const jobCreated = {
  ID: 'job.created',
  build: 'https://example.simprosuite.com',
  description: 'Job #42 has been created.',
  name: 'Job',
  action: 'created',
  reference: { companyID: 0, jobID: 42 },
  date_triggered: '2019-06-28T16:35:12+10:00',
};

const testEvent = {
  ID: 'test.updated',
  build: 'https://example.simprosuite.com',
  description: 'Test #1 has been updated.',
  name: 'Test',
  action: 'updated',
  reference: { testID: 1 },
  date_triggered: '2019-06-30T19:02:37-05:00',
};

function makeRequest(body: string, signature?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature) headers['x-response-signature'] = signature;
  return new NextRequest('http://localhost/webhooks/simpro', { method: 'POST', headers, body });
}

beforeAll(() => {
  process.env.SIMPRO_WEBHOOK_SECRET = SECRET;
});

describe('verifySimproSignature', () => {
  const body = JSON.stringify(jobCreated);

  it('accepts a valid signature', () => {
    expect(verifySimproSignature(body, sign(body), SECRET)).toBe(true);
  });

  it('produces a 40-char hex digest', () => {
    expect(sign(body)).toMatch(/^[a-f0-9]{40}$/);
  });

  it('accepts uppercase hex', () => {
    expect(verifySimproSignature(body, sign(body).toUpperCase(), SECRET)).toBe(true);
  });

  it('rejects a tampered body', () => {
    expect(verifySimproSignature(body + ' ', sign(body), SECRET)).toBe(false);
  });

  it('rejects the wrong secret', () => {
    expect(verifySimproSignature(body, sign(body, 'other'), SECRET)).toBe(false);
  });

  it('rejects a SHA-256 signature', () => {
    const sha256 = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
    expect(verifySimproSignature(body, sha256, SECRET)).toBe(false);
  });

  it('rejects a prefixed signature', () => {
    expect(verifySimproSignature(body, `sha1=${sign(body)}`, SECRET)).toBe(false);
  });

  it('rejects invalid hex of the right length', () => {
    expect(verifySimproSignature(body, 'zz'.repeat(20), SECRET)).toBe(false);
  });

  it('rejects a truncated signature', () => {
    expect(verifySimproSignature(body, sign(body).slice(0, 20), SECRET)).toBe(false);
  });

  it('rejects missing signature or secret', () => {
    expect(verifySimproSignature(body, undefined, SECRET)).toBe(false);
    expect(verifySimproSignature(body, sign(body), undefined)).toBe(false);
  });
});

describe('POST /webhooks/simpro', () => {
  it('accepts a signed job.created event', async () => {
    const body = JSON.stringify(jobCreated);
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts the Test Subscription event', async () => {
    const body = JSON.stringify(testEvent);
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
  });

  it('accepts a signed body with any content type', async () => {
    const body = JSON.stringify(jobCreated);
    const res = await POST(makeRequest(body, sign(body), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 401 when the signature header is missing', async () => {
    const res = await POST(makeRequest(JSON.stringify(jobCreated)));
    expect(res.status).toBe(401);
  });

  it('returns 401 for an invalid signature', async () => {
    const res = await POST(makeRequest(JSON.stringify(jobCreated), 'a'.repeat(40)));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the body was altered after signing', async () => {
    const signature = sign(JSON.stringify(jobCreated));
    const res = await POST(makeRequest(JSON.stringify({ ...jobCreated, ID: 'job.deleted' }), signature));
    expect(res.status).toBe(401);
  });

  it('returns 400 for a signed non-JSON body', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, sign(body), 'text/plain'));
    expect(res.status).toBe(400);
  });
});
