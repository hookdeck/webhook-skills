const request = require('supertest');
const crypto = require('crypto');

const SECRET = 'AbCdEfG123456';
process.env.CRYPTOPROCESSING_WEBHOOK_SECRET = SECRET;

const { app, verifyCryptoProcessingSignature } = require('../src/index');

// Generate a real signature: lowercase hex HMAC-SHA512 of the raw body
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha512', secret).update(body).digest('hex');
}

function post(body, headers = {}) {
  return request(app)
    .post('/webhooks/cryptoprocessing')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(body);
}

// Based on the documented deposit callback
let counter = 100;
function callback(overrides = {}) {
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
  const docBody = '{"currency":"BTC","foreign_id":"123456"}';
  const docSig =
    '03c25fcf7cd35e7d995e402cd5d51edd72d48e1471e865907967809a0c189ba55b90815f20e2bb10f82c7a9e9d865546fda58989c2ae9e8e2ff7bc29195fa1ec';

  it('accepts the published test vector', () => {
    expect(verifyCryptoProcessingSignature(Buffer.from(docBody), docSig, 'AbCdEfG123456')).toBe(true);
  });

  it('compares hex case-insensitively', () => {
    expect(verifyCryptoProcessingSignature(Buffer.from(docBody), docSig.toUpperCase(), 'AbCdEfG123456')).toBe(true);
  });

  it('rejects a tampered body', () => {
    expect(verifyCryptoProcessingSignature(Buffer.from(docBody + ' '), docSig, 'AbCdEfG123456')).toBe(false);
  });

  it('rejects the wrong secret', () => {
    expect(verifyCryptoProcessingSignature(Buffer.from(docBody), docSig, 'abcdefg123456')).toBe(false);
  });

  it('rejects missing signature or secret', () => {
    expect(verifyCryptoProcessingSignature(Buffer.from(docBody), undefined, 'AbCdEfG123456')).toBe(false);
    expect(verifyCryptoProcessingSignature(Buffer.from(docBody), '', 'AbCdEfG123456')).toBe(false);
    expect(verifyCryptoProcessingSignature(Buffer.from(docBody), docSig, undefined)).toBe(false);
  });

  it('rejects malformed signatures', () => {
    expect(verifyCryptoProcessingSignature(Buffer.from(docBody), 'abc', 'AbCdEfG123456')).toBe(false);
    expect(verifyCryptoProcessingSignature(Buffer.from(docBody), docSig.slice(0, 127), 'AbCdEfG123456')).toBe(false);
    expect(verifyCryptoProcessingSignature(Buffer.from(docBody), `${docSig.slice(0, 127)}z`, 'AbCdEfG123456')).toBe(false);
    expect(verifyCryptoProcessingSignature(Buffer.from(docBody), `sha512=${docSig}`, 'AbCdEfG123456')).toBe(false);
  });
});

describe('POST /webhooks/cryptoprocessing', () => {
  it('accepts the published test vector over HTTP', async () => {
    const res = await post('{"currency":"BTC","foreign_id":"123456"}', {
      'X-Processing-Signature':
        '03c25fcf7cd35e7d995e402cd5d51edd72d48e1471e865907967809a0c189ba55b90815f20e2bb10f82c7a9e9d865546fda58989c2ae9e8e2ff7bc29195fa1ec',
    });
    expect(res.status).toBe(200);
  });

  it('accepts a validly signed deposit callback', async () => {
    const body = callback();
    const res = await post(body, { 'X-Processing-Key': 'master-key', 'X-Processing-Signature': sign(body) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
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
    const res = await post(body, { 'X-Processing-Signature': sign(body) });
    expect(res.status).toBe(200);
  });

  it('handles payment_request callbacks that have no numeric id', async () => {
    const body = JSON.stringify({ payment_request_id: 'pr-1', type: 'payment_request', status: 'processing' });
    const res = await post(body, { 'X-Processing-Signature': sign(body) });
    expect(res.status).toBe(200);
  });

  it('answers a duplicate callback with 201', async () => {
    const body = callback({ id: 5000, status: 'confirmed' });
    const headers = { 'X-Processing-Signature': sign(body) };
    expect((await post(body, headers)).status).toBe(200);
    expect((await post(body, headers)).status).toBe(201);
  });

  it('treats a new status of the same transaction as a new callback', async () => {
    const pending = callback({ id: 6000, status: 'pending' });
    const confirmed = callback({ id: 6000, status: 'confirmed' });
    expect((await post(pending, { 'X-Processing-Signature': sign(pending) })).status).toBe(200);
    expect((await post(confirmed, { 'X-Processing-Signature': sign(confirmed) })).status).toBe(200);
  });

  it('verifies regardless of content type', async () => {
    const body = callback();
    const res = await request(app)
      .post('/webhooks/cryptoprocessing')
      .set('Content-Type', 'text/plain')
      .set('X-Processing-Signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature header', async () => {
    const res = await post(callback());
    expect(res.status).toBe(401);
  });

  it('rejects an invalid signature', async () => {
    const body = callback();
    const res = await post(body, { 'X-Processing-Signature': sign(body, 'wrong-secret') });
    expect(res.status).toBe(401);
  });

  it('rejects a malformed signature', async () => {
    const res = await post(callback(), { 'X-Processing-Signature': 'not-hex' });
    expect(res.status).toBe(401);
  });

  it('rejects a body modified after signing', async () => {
    const body = callback();
    const res = await post(body.replace('1000.00000000', '9999.00000000'), {
      'X-Processing-Signature': sign(body),
    });
    expect(res.status).toBe(401);
  });

  it('rejects signed but invalid JSON', async () => {
    const bad = '{not json';
    const res = await post(bad, { 'X-Processing-Signature': sign(bad) });
    expect(res.status).toBe(400);
  });
});
