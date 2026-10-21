import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { verifyRutterWebhook } from '../lib/rutter';
import { POST } from '../app/webhooks/rutter/route';

const secret = 'test_rutter_client_secret';

beforeAll(() => {
  process.env.RUTTER_CLIENT_SECRET = secret;
  process.env.RUTTER_CLIENT_SECRET_PREVIOUS = '';
});

afterEach(() => {
  process.env.RUTTER_CLIENT_SECRET_PREVIOUS = '';
});

/**
 * Generate a valid Rutter signature: "sha256=" + base64(HMAC-SHA256(payload, secret))
 */
function generateRutterSignature(payload: string, key: string): string {
  return 'sha256=' + crypto.createHmac('sha256', key).update(payload).digest('base64');
}

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/webhooks/rutter', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('verifyRutterWebhook', () => {
  const payload = '{"type":"CONNECTION","code":"INITIAL_UPDATE"}';

  it('returns true for a valid signature', () => {
    expect(verifyRutterWebhook(payload, generateRutterSignature(payload, secret), [secret])).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    expect(verifyRutterWebhook(payload, 'sha256=invalid', [secret])).toBe(false);
  });

  it('returns false for a missing header', () => {
    expect(verifyRutterWebhook(payload, null, [secret])).toBe(false);
  });

  it('returns false when signed with the wrong secret', () => {
    expect(verifyRutterWebhook(payload, generateRutterSignature(payload, 'other'), [secret])).toBe(false);
  });

  it('returns false when the payload was modified', () => {
    const sig = generateRutterSignature(payload, secret);
    expect(verifyRutterWebhook('{"tampered":true}', sig, [secret])).toBe(false);
  });

  it('accepts any entry in a comma-separated list (secret rotation)', () => {
    const list = [
      generateRutterSignature(payload, 'new_secret'),
      generateRutterSignature(payload, 'expiring_secret'),
    ].join(', ');
    expect(verifyRutterWebhook(payload, list, ['expiring_secret'])).toBe(true);
    expect(verifyRutterWebhook(payload, list, ['new_secret'])).toBe(true);
    expect(verifyRutterWebhook(payload, list, ['unrelated'])).toBe(false);
  });

  it('does not require a space after the comma', () => {
    const list = [
      generateRutterSignature(payload, 'new_secret'),
      generateRutterSignature(payload, secret),
    ].join(',');
    expect(verifyRutterWebhook(payload, list, [secret])).toBe(true);
  });

  it('ignores empty secrets', () => {
    expect(verifyRutterWebhook(payload, generateRutterSignature(payload, ''), ['', undefined])).toBe(false);
  });
});

describe('POST /webhooks/rutter', () => {
  const payload = JSON.stringify({
    type: 'CONNECTION',
    code: 'INITIAL_UPDATE',
    connection_id: '3adc1519-0d6e-4222-83de-25b457cf42be',
    access_token: '313c3e00-2bbc-4b2e-a9dc-13abed546b65',
  });

  it('returns 400 for a missing signature', async () => {
    const res = await POST(makeRequest(payload));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await POST(makeRequest(payload, { 'x-rutter-signatures': 'sha256=bad' }));
    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid X-Rutter-Signatures header', async () => {
    const sig = generateRutterSignature(payload, secret);
    const res = await POST(makeRequest(payload, { 'x-rutter-signature': sig, 'x-rutter-signatures': sig }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('falls back to X-Rutter-Signature when the list header is absent', async () => {
    const sig = generateRutterSignature(payload, secret);
    const res = await POST(makeRequest(payload, { 'x-rutter-signature': sig }));
    expect(res.status).toBe(200);
  });

  it('accepts a delivery signed with the new and expiring secrets', async () => {
    process.env.RUTTER_CLIENT_SECRET_PREVIOUS = 'expiring_secret';
    const list = [
      generateRutterSignature(payload, 'brand_new_secret'),
      generateRutterSignature(payload, 'expiring_secret'),
    ].join(', ');
    const res = await POST(makeRequest(payload, { 'x-rutter-signatures': list }));
    expect(res.status).toBe(200);
  });

  const events = [
    { type: 'CONNECTION', code: 'CONNECTION_NEEDS_UPDATE', update_url: 'https://link.rutterapi.com/connection/x' },
    { type: 'CONNECTION', code: 'CONNECTION_DISABLED', disable_error: 'e', disable_message: 'm' },
    { type: 'ORDER', code: 'ORDER_CREATED', order: { id: 'o1' } },
    { type: 'ORDER', code: 'ORDER_UPDATED', order: { id: 'o1' } },
    { type: 'ORDER', code: 'ORDER_DELETED', order: { id: 'o1' } },
    { type: 'INVOICE', code: 'INVOICE_CREATED', invoice: { id: 'i1' } },
    { type: 'INVOICE', code: 'INVOICE_UPDATED', invoice: { id: 'i1' } },
    { type: 'VENDOR', code: 'VENDOR_CREATED', vendor: { id: 'v1' } }, // unhandled but acknowledged
  ];

  it.each(events)('acknowledges $code', async (event) => {
    const body = JSON.stringify({ ...event, connection_id: 'c1', access_token: 't1' });
    const res = await POST(makeRequest(body, { 'x-rutter-signatures': generateRutterSignature(body, secret) }));
    expect(res.status).toBe(200);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, { 'x-rutter-signatures': generateRutterSignature(body, secret) }));
    expect(res.status).toBe(400);
  });
});
