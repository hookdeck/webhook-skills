import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { verifyZenefitsSignature } from '../lib/verify';
import { POST } from '../app/webhooks/zenefits/route';

// Example from the Zenefits docs
const DOC_SECRET = 'lDVtBQnoRcqYv4fUeVD0oyzgsKWHGtqhatjBX5wXRFQzkVUCzBA571E4qUxvR5LE';
const DOC_BODY = '{"test":"valid payload"}';
const DOC_SIGNATURE = '219a08ea32f319931dc849badc076323f40367aad859ddba4de82e33135fad31';

beforeAll(() => {
  process.env.ZENEFITS_WEBHOOK_SECRET = DOC_SECRET;
});

// Same algorithm as Zenefits: hex(HMAC-SHA256(body, secret))
function sign(body: string, secret = DOC_SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function post(body: string, signature?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature !== undefined) headers['signature'] = signature;
  return POST(
    new NextRequest('http://localhost:3000/webhooks/zenefits', { method: 'POST', headers, body })
  );
}

const event = (type: string) =>
  JSON.stringify({ object: '/meta/event', type, data: { id: '1', object: '/core/people' } });

describe('verifyZenefitsSignature', () => {
  it('matches the example in the Zenefits docs', () => {
    expect(sign(DOC_BODY)).toBe(DOC_SIGNATURE);
    expect(verifyZenefitsSignature(DOC_BODY, DOC_SIGNATURE, DOC_SECRET)).toBe(true);
  });

  it('accepts an uppercase hex signature', () => {
    expect(verifyZenefitsSignature(DOC_BODY, DOC_SIGNATURE.toUpperCase(), DOC_SECRET)).toBe(true);
  });

  it('rejects wrong secret, missing header, short, long, and non-hex values', () => {
    expect(verifyZenefitsSignature(DOC_BODY, sign(DOC_BODY, 'other'), DOC_SECRET)).toBe(false);
    expect(verifyZenefitsSignature(DOC_BODY, null, DOC_SECRET)).toBe(false);
    expect(verifyZenefitsSignature(DOC_BODY, 'short', DOC_SECRET)).toBe(false);
    expect(verifyZenefitsSignature(DOC_BODY, DOC_SIGNATURE + '00', DOC_SECRET)).toBe(false);
    expect(verifyZenefitsSignature(DOC_BODY, 'zz' + DOC_SIGNATURE.slice(2), DOC_SECRET)).toBe(false);
    expect(verifyZenefitsSignature(DOC_BODY, DOC_SIGNATURE, undefined)).toBe(false);
  });
});

describe('POST /webhooks/zenefits', () => {
  it('accepts a valid signature and handles known events', async () => {
    for (const type of [
      'companies.did_change',
      'people.did_create',
      'people.did_change',
      'employments.did_start',
      'employments.did_terminate',
      'flow.did_complete.hiring',
    ]) {
      const body = event(type);
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    }
  });

  it('accepts unhandled event types with a valid signature', async () => {
    const body = event('departments.did_create');
    expect((await post(body, sign(body))).status).toBe(200);
  });

  it('verifies regardless of content type', async () => {
    const body = event('people.did_create');
    expect((await post(body, sign(body), 'text/plain')).status).toBe(200);
  });

  it('rejects an invalid signature', async () => {
    expect((await post(event('people.did_create'), sign('tampered'))).status).toBe(401);
  });

  it('rejects a missing signature header', async () => {
    expect((await post(event('people.did_create'))).status).toBe(401);
  });

  it('rejects a body modified after signing', async () => {
    const signature = sign(event('people.did_create'));
    expect((await post(event('people.did_change'), signature)).status).toBe(401);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const body = 'not json';
    expect((await post(body, sign(body), 'text/plain')).status).toBe(400);
  });
});
