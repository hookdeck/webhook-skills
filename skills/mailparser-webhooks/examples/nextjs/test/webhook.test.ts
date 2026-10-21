// Generated with: mailparser-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/mailparser/route';
import { bodyHash, headerName, verifyMailparserHeader } from '../lib/mailparser';

// Mailparser has no signature: the credential is the exact Additional Header
// value configured on the webhook (a secret header, or Basic Auth as in the docs).
const SECRET = 'c0ffee5ecret9f8e7d6c5b4a3928170615';
const BASIC = `Basic ${Buffer.from('mailparser:s3cr3t-p@ss').toString('base64')}`;

// Body is whatever the HTTP Body Payload Template renders.
const PARSED = {
  invoice_number: 'INV-1042',
  total: '129.00',
  from: 'billing@example.com',
};

function post(headers: Record<string, string>, body: string = JSON.stringify(PARSED)) {
  return POST(
    new NextRequest('http://localhost:3000/webhooks/mailparser', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body,
    })
  );
}

describe('Mailparser webhook', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.MAILPARSER_WEBHOOK_HEADER = 'X-Webhook-Secret';
    process.env.MAILPARSER_WEBHOOK_SECRET = SECRET;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    process.env = { ...saved };
    vi.restoreAllMocks();
  });

  test('accepts the configured secret header', async () => {
    const res = await post({ 'X-Webhook-Secret': SECRET });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  test('header name matching is case-insensitive', async () => {
    expect((await post({ 'x-webhook-secret': SECRET })).status).toBe(200);
  });

  test('accepts Basic Auth in the Authorization header', async () => {
    process.env.MAILPARSER_WEBHOOK_HEADER = 'Authorization';
    process.env.MAILPARSER_WEBHOOK_SECRET = BASIC;
    expect((await post({ Authorization: BASIC })).status).toBe(200);
  });

  test('rejects Basic Auth value without its scheme prefix', async () => {
    process.env.MAILPARSER_WEBHOOK_HEADER = 'Authorization';
    process.env.MAILPARSER_WEBHOOK_SECRET = BASIC;
    expect((await post({ Authorization: BASIC.replace('Basic ', '') })).status).toBe(401);
  });

  test('rejects a wrong secret', async () => {
    expect((await post({ 'X-Webhook-Secret': 'wrong' })).status).toBe(401);
  });

  test('rejects a secret of the same length', async () => {
    expect((await post({ 'X-Webhook-Secret': 'x'.repeat(SECRET.length) })).status).toBe(401);
  });

  test('rejects a missing header', async () => {
    expect((await post({})).status).toBe(401);
  });

  test('returns 500 when no secret is configured', async () => {
    delete process.env.MAILPARSER_WEBHOOK_SECRET;
    expect((await post({ 'X-Webhook-Secret': SECRET })).status).toBe(500);
  });

  test('returns 400 for invalid JSON after authenticating', async () => {
    expect((await post({ 'X-Webhook-Secret': SECRET }, '{not json')).status).toBe(400);
  });

  test('returns 400 for a non-object JSON body', async () => {
    expect((await post({ 'X-Webhook-Secret': SECRET }, '[1,2]')).status).toBe(400);
  });

  test('does not leak parse errors to unauthenticated callers', async () => {
    expect((await post({ 'X-Webhook-Secret': 'wrong' }, '{not json')).status).toBe(401);
  });

  test('defaults the header name to x-webhook-secret', () => {
    expect(headerName({})).toBe('x-webhook-secret');
    expect(headerName({ MAILPARSER_WEBHOOK_HEADER: ' Authorization ' })).toBe('authorization');
  });

  test('verifyMailparserHeader fails closed and handles length mismatch', () => {
    expect(verifyMailparserHeader(undefined, SECRET)).toBe(false);
    expect(verifyMailparserHeader(SECRET, undefined)).toBe(false);
    expect(verifyMailparserHeader('short', SECRET)).toBe(false);
    expect(verifyMailparserHeader(SECRET, SECRET)).toBe(true);
  });

  test('bodyHash is a stable sha256 hex digest', () => {
    expect(bodyHash('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });
});
