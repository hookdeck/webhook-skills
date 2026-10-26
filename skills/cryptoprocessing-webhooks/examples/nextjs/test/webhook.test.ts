import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { verifyCryptoProcessingSignature } from '../lib/cryptoprocessing';

const SECRET = 'AbCdEfG123456';

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.CRYPTOPROCESSING_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/cryptoprocessing/route'));
});

// Generate a real signature: lowercase hex HMAC-SHA512 of the raw body
function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha512', secret).update(body).digest('hex');
}

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/webhooks/cryptoprocessing', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

// Based on the documented deposit callback
let counter = 100;
function callback(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: ++counter,
    end_user_reference: 'user_12345',
    type: 'deposit',
    crypto_address: { id: 1, currency: 'USDC', address: '0x9F2E4b7A1C3D5F6E8B0A2C4D6E8F1A3B5C7D9E0F', tag: null, foreign_id: '12345' },
    currency_sent: { currency: 'USDC', amount: '1000.00000000' },
    currency_received: { currency: 'USDC', amount: '1000.00000000', amount_minus_fee: '997.00000000' },
    transactions: [],
    fees: [],
    error: '',
    status: 'confirmed',
    ...overrides,
  });
}

describe('verifyCryptoProcessingSignature', () => {
  // Published test vector from the CryptoProcessing docs
  const docBody = Buffer.from('{"currency":"BTC","foreign_id":"123456"}');
  const docSig =
    '03c25fcf7cd35e7d995e402cd5d51edd72d48e1471e865907967809a0c189ba55b90815f20e2bb10f82c7a9e9d865546fda58989c2ae9e8e2ff7bc29195fa1ec';

  it('accepts the published test vector', () => {
    expect(verifyCryptoProcessingSignature(docBody, docSig, 'AbCdEfG123456')).toBe(true);
  });

  it('compares hex case-insensitively', () => {
    expect(verifyCryptoProcessingSignature(docBody, docSig.toUpperCase(), 'AbCdEfG123456')).toBe(true);
  });

  it('rejects a tampered body', () => {
    expect(verifyCryptoProcessingSignature(Buffer.from(docBody.toString() + ' '), docSig, 'AbCdEfG123456')).toBe(false);
  });

  it('rejects the wrong secret', () => {
    expect(verifyCryptoProcessingSignature(docBody, docSig, 'abcdefg123456')).toBe(false);
  });

  it('rejects missing signature or secret', () => {
    expect(verifyCryptoProcessingSignature(docBody, null, 'AbCdEfG123456')).toBe(false);
    expect(verifyCryptoProcessingSignature(docBody, '', 'AbCdEfG123456')).toBe(false);
    expect(verifyCryptoProcessingSignature(docBody, docSig, undefined)).toBe(false);
  });

  it('rejects malformed signatures', () => {
    expect(verifyCryptoProcessingSignature(docBody, 'abc', 'AbCdEfG123456')).toBe(false);
    expect(verifyCryptoProcessingSignature(docBody, docSig.slice(0, 127), 'AbCdEfG123456')).toBe(false);
    expect(verifyCryptoProcessingSignature(docBody, `${docSig.slice(0, 127)}z`, 'AbCdEfG123456')).toBe(false);
    expect(verifyCryptoProcessingSignature(docBody, `sha512=${docSig}`, 'AbCdEfG123456')).toBe(false);
  });
});

describe('POST /webhooks/cryptoprocessing', () => {
  it('accepts the published test vector over HTTP', async () => {
    const res = await POST(
      makeRequest('{"currency":"BTC","foreign_id":"123456"}', {
        'x-processing-signature':
          '03c25fcf7cd35e7d995e402cd5d51edd72d48e1471e865907967809a0c189ba55b90815f20e2bb10f82c7a9e9d865546fda58989c2ae9e8e2ff7bc29195fa1ec',
      })
    );
    expect(res.status).toBe(200);
  });

  it('accepts a validly signed deposit callback', async () => {
    const body = callback();
    const res = await POST(makeRequest(body, { 'x-processing-key': 'master-key', 'x-processing-signature': sign(body) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it.each([
    'deposit',
    'withdrawal',
    'exchange',
    'payment_request',
    'deposit_exchange',
    'deposit_wallet_client',
    'withdrawal_exchange',
    'withdrawal_instant',
    'withdrawal_instant_exchange',
    'invoice',
    'some_future_type',
  ])('accepts signed %s callbacks', async (type) => {
    const body = callback({ type });
    const res = await POST(makeRequest(body, { 'x-processing-signature': sign(body) }));
    expect(res.status).toBe(200);
  });

  it('handles payment_request callbacks that have no numeric id', async () => {
    const body = JSON.stringify({ payment_request_id: 'pr-1', type: 'payment_request', status: 'processing' });
    const res = await POST(makeRequest(body, { 'x-processing-signature': sign(body) }));
    expect(res.status).toBe(200);
  });

  it('answers a duplicate callback with 201', async () => {
    const body = callback({ id: 5000, status: 'confirmed' });
    const headers = { 'x-processing-signature': sign(body) };
    expect((await POST(makeRequest(body, headers))).status).toBe(200);
    expect((await POST(makeRequest(body, headers))).status).toBe(201);
  });

  it('treats a new status of the same transaction as a new callback', async () => {
    const pending = callback({ id: 6000, status: 'pending' });
    const confirmed = callback({ id: 6000, status: 'confirmed' });
    expect((await POST(makeRequest(pending, { 'x-processing-signature': sign(pending) }))).status).toBe(200);
    expect((await POST(makeRequest(confirmed, { 'x-processing-signature': sign(confirmed) }))).status).toBe(200);
  });

  it('verifies regardless of content type', async () => {
    const body = callback();
    const res = await POST(makeRequest(body, { 'content-type': 'text/plain', 'x-processing-signature': sign(body) }));
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature header', async () => {
    const res = await POST(makeRequest(callback()));
    expect(res.status).toBe(401);
  });

  it('rejects an invalid signature', async () => {
    const body = callback();
    const res = await POST(makeRequest(body, { 'x-processing-signature': sign(body, 'wrong-secret') }));
    expect(res.status).toBe(401);
  });

  it('rejects a malformed signature', async () => {
    const res = await POST(makeRequest(callback(), { 'x-processing-signature': 'not-hex' }));
    expect(res.status).toBe(401);
  });

  it('rejects a body modified after signing', async () => {
    const body = callback();
    const res = await POST(
      makeRequest(body.replace('1000.00000000', '9999.00000000'), { 'x-processing-signature': sign(body) })
    );
    expect(res.status).toBe(401);
  });

  it('rejects signed but invalid JSON', async () => {
    const bad = '{not json';
    const res = await POST(makeRequest(bad, { 'x-processing-signature': sign(bad) }));
    expect(res.status).toBe(400);
  });
});
