import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/storylane/route';
import { verifyStorylaneSignature } from '../lib/storylane';

const SECRET = 'storylane_test_verification_secret';

function sign(body: string, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('base64');
}

// Payload as shown in Storylane's docs (demo_viewed)
const demoViewed = JSON.stringify({
  id: 'a61a8af4-8a33-4b4d-9861-d8542bcb4d36',
  analytics_url: 'https://app.storylane.io/audience/sessions/a61a8af4-8a33-4b4d-9861-d8542bcb4d36',
  buyer_reveal: {
    company_name: 'Acme Inc',
    company_domain: 'example.com',
    company_annual_revenue_range: '$1B-$10B',
    company_employee_range: '1K-5K',
    confidence_score: 'low',
  },
  checklist_completed: false,
  completion: 100,
  cta_opened: null,
  host_url: 'https://app.storylane.io/share/lcmplr8qd0rj',
  intent_level: 'high',
  lead: {
    id: 'dcc7997a-c811-4778-a065-cc009ad6b46e',
    client_source: 'none',
    client_tracking_id: null,
    email: 'webhooktest@test.com',
    first_name: '',
    last_name: '',
    lead_source: 'Nurtured',
  },
  link: 'https://app.storylane.io/share/lcmplr8qd0rj',
  link_name: 'Default',
  location: { city: 'Pune', country: 'India', state: 'MH' },
  name: 'test for Pardot',
  referers: ['https://app.storylane.io/share/lcmplr8qd0rj?email=webhooktest@test.com'],
  time_spent: 10,
  utm_params: {},
  viewed_at: '2026-05-20T03:27:29.246-07:00',
  event: 'demo_viewed',
});
const anonymous = JSON.stringify({ ...JSON.parse(demoViewed), lead: null });
const unknownEvent = JSON.stringify({ id: 'x', event: 'something_else' });

function post(body: string, signature?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature !== undefined) headers['x-storylane-signature'] = signature;
  return POST(
    new NextRequest('http://localhost:3000/webhooks/storylane', { method: 'POST', headers, body })
  );
}

beforeAll(() => {
  process.env.STORYLANE_WEBHOOK_SECRET = SECRET;
});

describe('verifyStorylaneSignature', () => {
  const body = Buffer.from(demoViewed);

  it('accepts a valid signature', () => {
    expect(verifyStorylaneSignature(body, sign(demoViewed), SECRET)).toBe(true);
  });

  it('rejects wrong secret, tampered body, missing and empty header', () => {
    expect(verifyStorylaneSignature(body, sign(demoViewed, 'other'), SECRET)).toBe(false);
    expect(verifyStorylaneSignature(Buffer.from(demoViewed + ' '), sign(demoViewed), SECRET)).toBe(false);
    expect(verifyStorylaneSignature(body, null, SECRET)).toBe(false);
    expect(verifyStorylaneSignature(body, '', SECRET)).toBe(false);
  });

  it('rejects malformed values: unpadded, prefixed, wrong length, bad alphabet', () => {
    const sig = sign(demoViewed);
    expect(verifyStorylaneSignature(body, sig.slice(0, -1), SECRET)).toBe(false);
    expect(verifyStorylaneSignature(body, 'sha256=' + sig, SECRET)).toBe(false);
    expect(verifyStorylaneSignature(body, sig + sig, SECRET)).toBe(false);
    expect(verifyStorylaneSignature(body, sig.slice(0, 40) + '!!!' + '=', SECRET)).toBe(false);
    expect(verifyStorylaneSignature(body, ` ${sig}`, SECRET)).toBe(false);
  });

  it('rejects a non-canonical base64 value that decodes to the same bytes', () => {
    const sig = sign(demoViewed);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const alt = alphabet[alphabet.indexOf(sig[42]) ^ 1]; // flips an unused low bit
    const variant = sig.slice(0, 42) + alt + '=';
    expect(Buffer.from(variant, 'base64').equals(Buffer.from(sig, 'base64'))).toBe(true);
    expect(verifyStorylaneSignature(body, variant, SECRET)).toBe(false);
  });
});

describe('POST /webhooks/storylane', () => {
  it('accepts a signed demo_viewed event', async () => {
    const res = await post(demoViewed, sign(demoViewed));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts a demo_viewed event with lead = null', async () => {
    expect((await post(anonymous, sign(anonymous))).status).toBe(200);
  });

  it('accepts unknown events', async () => {
    expect((await post(unknownEvent, sign(unknownEvent))).status).toBe(200);
  });

  it('verifies the exact bytes for any content type', async () => {
    expect((await post(demoViewed, sign(demoViewed), 'text/plain')).status).toBe(200);
  });

  it('verifies the exact bytes, not re-serialised JSON', async () => {
    const spaced = JSON.stringify(JSON.parse(demoViewed), null, 2);
    expect((await post(spaced, sign(spaced))).status).toBe(200);
    expect((await post(spaced, sign(demoViewed))).status).toBe(401);
  });

  it('rejects a missing, empty, wrong or malformed signature with 401', async () => {
    expect((await post(demoViewed)).status).toBe(401);
    expect((await post(demoViewed, '')).status).toBe(401);
    expect((await post(demoViewed, sign(demoViewed, 'other'))).status).toBe(401);
    expect((await post(demoViewed, 'not-base64')).status).toBe(401);
  });

  it('rejects a signed body that is not a JSON object with 400', async () => {
    expect((await post('not json', sign('not json'))).status).toBe(400);
    expect((await post('[1]', sign('[1]'))).status).toBe(400);
    expect((await post('null', sign('null'))).status).toBe(400);
  });
});
