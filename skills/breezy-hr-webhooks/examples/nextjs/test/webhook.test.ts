import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Breezy secrets look like Standard Webhooks secrets, but the whole string
// (including whsec_) is used as a UTF-8 HMAC key.
const SECRET = 'whsec_test_secret_key_0123456789abcdef';
process.env.BREEZY_HR_WEBHOOK_SECRET = SECRET;

import { POST } from '../app/webhooks/breezy-hr/route';
import { verifyBreezySignature } from '../lib/verify';

function sign(body: string, secret: string = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function candidateAdded(type = 'candidateAdded') {
  return {
    _id: 'evt_123',
    type,
    object: {
      company: { _id: 'c1', name: 'Acme', friendly_id: 'acme' },
      position: { _id: 'p1', name: 'Engineer', pipeline_id: 'pl1' },
      stage: { id: 's1', name: 'Applied' },
      candidate: { _id: 'cand1', name: 'Ada Lovelace', email_address: 'ada@example.com' },
    },
    creation_date: '2026-01-05T19:26:51.000Z',
  };
}

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/webhooks/breezy-hr', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('verifyBreezySignature', () => {
  const body = '{"a":1}';

  it('accepts a valid signature', () => {
    expect(verifyBreezySignature(body, sign(body), SECRET)).toBe(true);
  });

  it('rejects a different secret, a stripped whsec_ key and a base64-decoded key', () => {
    expect(verifyBreezySignature(body, sign(body, 'other'), SECRET)).toBe(false);
    expect(verifyBreezySignature(body, sign(body, SECRET.slice(6)), SECRET)).toBe(false);
    const decoded = Buffer.from(SECRET.slice(6), 'base64');
    const sig = crypto.createHmac('sha256', decoded).update(body).digest('hex');
    expect(verifyBreezySignature(body, sig, SECRET)).toBe(false);
  });

  it('rejects missing and wrong-length signatures without throwing', () => {
    expect(verifyBreezySignature(body, null, SECRET)).toBe(false);
    expect(verifyBreezySignature(body, 'abc', SECRET)).toBe(false);
  });
});

describe('POST /webhooks/breezy-hr', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts a validly signed event', async () => {
    const body = JSON.stringify(candidateAdded());
    const res = await POST(makeRequest(body, { 'x-hook-signature': sign(body) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies the raw bytes, including non-compact JSON', async () => {
    const body = JSON.stringify(candidateAdded(), null, 2);
    const res = await POST(makeRequest(body, { 'x-hook-signature': sign(body) }));
    expect(res.status).toBe(200);
  });

  it.each([
    'candidateAdded',
    'candidateStatusUpdated',
    'candidateDeleted',
    'companyPositionAdded',
    'companyPositionUpdated',
    'companyPositionDeleted',
    'companyPositionStateUpdated',
    'companyNotePosted',
    'companyNoteUpdated',
    'companyNoteDeleted',
    'somethingNew',
  ])('acknowledges %s', async (type) => {
    const body = JSON.stringify(candidateAdded(type));
    const res = await POST(makeRequest(body, { 'x-hook-signature': sign(body) }));
    expect(res.status).toBe(200);
  });

  it('rejects an invalid signature', async () => {
    const body = JSON.stringify(candidateAdded());
    const res = await POST(makeRequest(body, { 'x-hook-signature': sign(body, 'wrong') }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify(candidateAdded());
    const res = await POST(makeRequest(body.replace('Ada', 'Eve'), { 'x-hook-signature': sign(body) }));
    expect(res.status).toBe(400);
  });

  it('rejects a missing signature header', async () => {
    const res = await POST(makeRequest(JSON.stringify(candidateAdded())));
    expect(res.status).toBe(400);
  });

  it('rejects signed invalid JSON', async () => {
    const body = '{not json';
    const res = await POST(makeRequest(body, { 'x-hook-signature': sign(body) }));
    expect(res.status).toBe(400);
  });
});
