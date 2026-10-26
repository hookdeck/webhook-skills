import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/partnero/route';
import { verifyPartneroSignature } from '../lib/partnero';

const SECRET = 'partnero_test_signing_secret';

function sign(body: string | Buffer, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function makeRequest(body: string, headers: Record<string, string> = {}, type = 'application/json') {
  return new NextRequest('http://localhost:3000/webhooks/partnero', {
    method: 'POST',
    headers: { 'content-type': type, ...headers },
    body,
  });
}

// Shape from Partnero's documented partner.created payload
const partnerCreated = JSON.stringify({
  event: 'partner.created',
  url: 'https://your-server.com/webhooks/partnero',
  webhook_key: 'wh_abc123',
  created_at: '2025-01-15T10:30:00.000000Z',
  data: {
    id: 'partner_abc123',
    email: 'partner@partnero.com',
    name: 'John',
    surname: 'Doe',
    status: 'approved',
    created_at: '2025-01-15T10:30:00.000000Z',
    metadata: {},
  },
});

// PHP's json_encode escapes slashes and non-ASCII; the signature covers these exact bytes
const phpEncoded =
  '{"event":"transaction.created","url":"https:\\/\\/your-server.com\\/webhooks\\/partnero",' +
  '"webhook_key":"wh_abc123","created_at":"2025-01-15T14:22:00.000000Z",' +
  '"data":{"key":"txn_123","amount":99.99,"currency":"USD","action":"sale","note":"caf\\u00e9"}}';

beforeAll(() => {
  process.env.PARTNERO_WEBHOOK_SECRET = SECRET;
});

describe('verifyPartneroSignature', () => {
  const raw = Buffer.from(partnerCreated);

  it('accepts a valid signature, including uppercase hex', () => {
    expect(verifyPartneroSignature(raw, sign(raw), SECRET)).toBe(true);
    expect(verifyPartneroSignature(raw, sign(raw).toUpperCase(), SECRET)).toBe(true);
  });

  it('rejects wrong secret, missing, empty, short, long, non-hex and prefixed values', () => {
    expect(verifyPartneroSignature(raw, sign(raw, 'other'), SECRET)).toBe(false);
    expect(verifyPartneroSignature(raw, null, SECRET)).toBe(false);
    expect(verifyPartneroSignature(raw, '', SECRET)).toBe(false);
    expect(verifyPartneroSignature(raw, 'abcd', SECRET)).toBe(false);
    expect(verifyPartneroSignature(raw, sign(raw) + '00', SECRET)).toBe(false);
    expect(verifyPartneroSignature(raw, 'zz'.repeat(32), SECRET)).toBe(false);
    expect(verifyPartneroSignature(raw, 'sha256=' + sign(raw), SECRET)).toBe(false);
  });
});

describe('POST /webhooks/partnero', () => {
  it('accepts a signed partner.created event', async () => {
    const res = await POST(makeRequest(partnerCreated, { signature: sign(partnerCreated) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies the exact bytes (escaped slashes and unicode)', async () => {
    const ok = await POST(makeRequest(phpEncoded, { signature: sign(phpEncoded) }));
    expect(ok.status).toBe(200);
    const reserialised = JSON.stringify(JSON.parse(phpEncoded));
    const bad = await POST(makeRequest(phpEncoded, { signature: sign(reserialised) }));
    expect(bad.status).toBe(401);
  });

  it('accepts any content type', async () => {
    const res = await POST(makeRequest(partnerCreated, { signature: sign(partnerCreated) }, 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('logs unknown events and returns 200', async () => {
    const body = JSON.stringify({ event: 'customer.updated', data: { id: 'cust_1' } });
    const res = await POST(makeRequest(body, { signature: sign(body) }));
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature', async () => {
    expect((await POST(makeRequest(partnerCreated))).status).toBe(401);
  });

  it('rejects an invalid signature', async () => {
    expect((await POST(makeRequest(partnerCreated, { signature: 'a'.repeat(64) }))).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const res = await POST(makeRequest(partnerCreated.replace('John', 'Jane'), { signature: sign(partnerCreated) }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for a signed non-JSON body', async () => {
    const res = await POST(makeRequest('not json', { signature: sign('not json') }));
    expect(res.status).toBe(400);
  });
});
