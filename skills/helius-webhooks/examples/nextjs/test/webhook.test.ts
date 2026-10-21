import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Helius sends the configured authHeader verbatim as the Authorization header
const AUTH = 'Bearer test_helius_secret_token';

beforeAll(() => {
  process.env.HELIUS_AUTH_HEADER = AUTH;
});

import { POST } from '../app/webhooks/helius/route';
import { seenSignatures, verifyHeliusAuth } from '../lib/helius';

function makeTx(type: string, signature: string) {
  return {
    type,
    source: 'MAGIC_EDEN',
    description: `${type} test transaction`,
    signature,
    slot: 171942732,
    timestamp: 1673445241,
    fee: 10000,
    feePayer: 'CKs1E69a2e9TmH4mKKLrXFF8kD3ZnwKjoEuXa6sz9WqX',
    nativeTransfers: [],
    tokenTransfers: []
  };
}

function makeRequest(body: unknown, auth: string | null = AUTH) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth !== null) headers['Authorization'] = auth;
  return new NextRequest('http://localhost:3000/webhooks/helius', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
}

describe('verifyHeliusAuth', () => {
  it('accepts an identical value', () => {
    expect(verifyHeliusAuth('Bearer abc', 'Bearer abc')).toBe(true);
  });

  it('rejects different values, including different lengths', () => {
    expect(verifyHeliusAuth('Bearer abd', 'Bearer abc')).toBe(false);
    expect(verifyHeliusAuth('Bearer ab', 'Bearer abc')).toBe(false);
    expect(verifyHeliusAuth('abc', 'Bearer abc')).toBe(false);
  });

  it('rejects missing values', () => {
    expect(verifyHeliusAuth(null, 'Bearer abc')).toBe(false);
    expect(verifyHeliusAuth('Bearer abc', undefined)).toBe(false);
  });
});

describe('POST /webhooks/helius', () => {
  beforeEach(() => {
    seenSignatures.clear();
    process.env.HELIUS_AUTH_HEADER = AUTH;
  });

  it('accepts a request with the correct Authorization header', async () => {
    const res = await POST(makeRequest([makeTx('NFT_SALE', 'sig-nft-sale-1')]));
    expect(res.status).toBe(200);
  });

  it.each(['NFT_SALE', 'SWAP', 'TRANSFER'])('handles %s events', async (type) => {
    const res = await POST(makeRequest([makeTx(type, `sig-${type}`)]));
    expect(res.status).toBe(200);
  });

  it('accepts raw webhook transactions without a type', async () => {
    const res = await POST(makeRequest([{ signature: 'sig-raw-1', slot: 1, transaction: {} }]));
    expect(res.status).toBe(200);
  });

  it('accepts a batch of several transactions', async () => {
    const res = await POST(makeRequest([makeTx('SWAP', 'sig-b1'), makeTx('TRANSFER', 'sig-b2')]));
    expect(res.status).toBe(200);
    expect(seenSignatures.has('sig-b1')).toBe(true);
    expect(seenSignatures.has('sig-b2')).toBe(true);
  });

  it('does not reprocess a duplicate transaction signature', async () => {
    const logs: unknown[][] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => { logs.push(args); };
    try {
      await POST(makeRequest([makeTx('SWAP', 'sig-dup')]));
      await POST(makeRequest([makeTx('SWAP', 'sig-dup')]));
    } finally {
      console.log = original;
    }
    expect(logs.filter((l) => l[0] === 'Swap:')).toHaveLength(1);
  });

  it('accepts unknown transaction types', async () => {
    const res = await POST(makeRequest([makeTx('UNKNOWN', 'sig-unknown')]));
    expect(res.status).toBe(200);
  });

  it('rejects a missing Authorization header', async () => {
    const res = await POST(makeRequest([makeTx('SWAP', 'sig-x')], null));
    expect(res.status).toBe(401);
  });

  it('rejects an incorrect Authorization header', async () => {
    const res = await POST(makeRequest([makeTx('SWAP', 'sig-x')], 'Bearer wrong'));
    expect(res.status).toBe(401);
  });

  it('rejects the secret without its Bearer prefix (whole value must match)', async () => {
    const res = await POST(makeRequest([makeTx('SWAP', 'sig-x')], 'test_helius_secret_token'));
    expect(res.status).toBe(401);
  });

  it('rejects invalid JSON after a valid Authorization header', async () => {
    const res = await POST(makeRequest('not json'));
    expect(res.status).toBe(400);
  });

  it('returns 500 when HELIUS_AUTH_HEADER is not configured', async () => {
    delete process.env.HELIUS_AUTH_HEADER;
    const res = await POST(makeRequest([makeTx('SWAP', 'sig-x')]));
    expect(res.status).toBe(500);
  });
});
