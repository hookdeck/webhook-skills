import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/holded/route';
import { verifyHoldedSignature } from '../lib/holded-signature';

// Holded secrets look like whsec_... but the whole string (prefix included) is
// the plain HMAC key. It is not base64-decoded and not Standard Webhooks.
const SECRET = 'whsec_3b1f8a0c2d4e6f8091a2b3c4d5e6f70819a2b3c4d5e6f70819a2b3c4d5e6f708';

beforeAll(() => {
  process.env.HOLDED_WEBHOOK_SECRET = SECRET;
});

function sign(payload: string, secret = SECRET): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

const invoicePayload = JSON.stringify({ id: '64f0c0a1b2c3d4e5f6a7b8c9', docNumber: 'F230001' });
let idCounter = 0;

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/webhooks/holded', {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      'x-holded-webhook-event': 'invoice.create',
      'x-holded-webhook-id': `evt_${++idCounter}`,
      'x-holded-webhook-date': '2026-06-18T11:10:35Z',
      ...headers,
    },
  });
}

describe('verifyHoldedSignature', () => {
  it('accepts a valid signature', () => {
    expect(verifyHoldedSignature(invoicePayload, sign(invoicePayload), SECRET).valid).toBe(true);
  });

  it('accepts uppercase hex', () => {
    const header = 'sha256=' + sign(invoicePayload).slice(7).toUpperCase();
    expect(verifyHoldedSignature(invoicePayload, header, SECRET).valid).toBe(true);
  });

  it('rejects a missing header', () => {
    expect(verifyHoldedSignature(invoicePayload, null, SECRET).valid).toBe(false);
  });

  it('rejects a signature without the sha256= prefix', () => {
    expect(verifyHoldedSignature(invoicePayload, sign(invoicePayload).slice(7), SECRET).valid).toBe(false);
  });

  it('rejects wrong length and non-hex values', () => {
    const good = sign(invoicePayload).slice(7);
    expect(verifyHoldedSignature(invoicePayload, 'sha256=abcd', SECRET).valid).toBe(false);
    expect(verifyHoldedSignature(invoicePayload, 'sha256=' + 'z'.repeat(64), SECRET).valid).toBe(false);
    expect(verifyHoldedSignature(invoicePayload, 'sha256=' + good + 'zz', SECRET).valid).toBe(false);
    expect(verifyHoldedSignature(invoicePayload, 'sha256=' + good.slice(0, 62) + 'zz', SECRET).valid).toBe(false);
  });

  it('rejects a signature made with the stripped or base64-decoded secret', () => {
    const stripped = SECRET.replace(/^whsec_/, '');
    expect(verifyHoldedSignature(invoicePayload, sign(invoicePayload, stripped), SECRET).valid).toBe(false);
    const decoded = Buffer.from(stripped, 'base64');
    const header = 'sha256=' + crypto.createHmac('sha256', decoded).update(invoicePayload).digest('hex');
    expect(verifyHoldedSignature(invoicePayload, header, SECRET).valid).toBe(false);
  });

  it('rejects a tampered body', () => {
    expect(verifyHoldedSignature(invoicePayload + ' ', sign(invoicePayload), SECRET).valid).toBe(false);
  });
});

describe('POST /webhooks/holded', () => {
  it('returns 200 for a valid invoice.create', async () => {
    const res = await POST(makeRequest(invoicePayload, { 'x-holded-webhook-signature': sign(invoicePayload) }));
    expect(res.status).toBe(200);
    expect((await res.json()).received).toBe(true);
  });

  it('verifies regardless of content type', async () => {
    const res = await POST(
      makeRequest(invoicePayload, {
        'content-type': 'text/plain',
        'x-holded-webhook-event': 'contact.create',
        'x-holded-webhook-signature': sign(invoicePayload),
      })
    );
    expect(res.status).toBe(200);
  });

  it('returns 200 for events it does not handle specifically', async () => {
    const res = await POST(
      makeRequest(invoicePayload, {
        'x-holded-webhook-event': 'warehouse.update',
        'x-holded-webhook-signature': sign(invoicePayload),
      })
    );
    expect(res.status).toBe(200);
  });

  it('does not process a repeated x-holded-webhook-id twice', async () => {
    const headers = { 'x-holded-webhook-id': 'evt_dup', 'x-holded-webhook-signature': sign(invoicePayload) };
    expect((await (await POST(makeRequest(invoicePayload, headers))).json()).duplicate).toBeUndefined();
    expect((await (await POST(makeRequest(invoicePayload, headers))).json()).duplicate).toBe(true);
  });

  it('does not sign the date header', async () => {
    const res = await POST(
      makeRequest(invoicePayload, {
        'x-holded-webhook-signature': sign(invoicePayload),
        'x-holded-webhook-date': '1999-01-01T00:00:00Z',
      })
    );
    expect(res.status).toBe(200);
  });

  it('returns 401 for an invalid signature', async () => {
    const res = await POST(makeRequest(invoicePayload, { 'x-holded-webhook-signature': 'sha256=' + '0'.repeat(64) }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the signature header is missing', async () => {
    expect((await POST(makeRequest(invoicePayload))).status).toBe(401);
  });

  it('returns 400 for a validly signed body that is not JSON', async () => {
    const bad = 'not json';
    const res = await POST(makeRequest(bad, { 'x-holded-webhook-signature': sign(bad) }));
    expect(res.status).toBe(400);
  });
});
