import crypto from 'crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/qonto/route';
import { handleQontoEvent, verifyQontoSignature } from '../lib/qonto';

const SECRET = 'whsec_VuvcYxzMbryt1UBytq58jtGBxCgbQdzX/c0vj5ZLjUA=';

// Qonto: lowercase hex HMAC-SHA256(key = secret UTF-8 bytes, message = `<t>.<raw body>`)
function sign(body: string | Buffer, t: string, secret = SECRET): string {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  return crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(Buffer.concat([Buffer.from(`${t}.`), bytes]))
    .digest('hex');
}
const header = (body: string | Buffer, t = '1704110400', secret = SECRET) =>
  `t=${t},v1=${sign(body, t, secret)}`;

// Payloads trimmed from the sample bodies in Qonto's docs (one per handled type).
const transaction = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  subscription_id: '123e4567-e89b-12d3-a456-426614174000',
  organization_id: '123e4567-e89b-12d3-a456-426614174000',
  membership_id: '123e4567-e89b-12d3-a456-426614174000',
  type: 'v1/transactions',
  created_at: '2025-01-24T10:55:00Z',
  data: {
    event: 'created', id: '123e4567-e89b-12d3-a456-426614174000', amount: 50.01, currency: 'EUR',
    side: 'debit', operation_type: 'transfer', status: 'completed', label: 'ACME Corp',
    bank_account_id: '123e4567-e89b-12d3-a456-426614174000',
  },
};
const card = {
  ...transaction, type: 'v1/cards',
  data: { event: 'created', id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', nickname: '💳 for 🍗', status: 'pending', masked_pan: '511768******7662', card_type: 'debit' },
};
const transfer = {
  ...transaction, type: 'v1/transfers', created_at: '2025-04-22T12:00:00Z',
  data: { event: 'created', id: '497f6eca-6276-4993-bfeb-53cbbbba6f08', amount: 1100.5, amount_currency: 'EUR', status: 'pending', reference: 'Lease payment' },
};

function post(body: string, sig?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (sig !== undefined) headers['x-qonto-signature'] = sig;
  return POST(new NextRequest('http://localhost/webhooks/qonto', { method: 'POST', headers, body }));
}

describe('published test vector (Qonto docs)', () => {
  const VECTOR_SECRET = 'test-secret';
  const VECTOR_BODY = '{"test":"data"}';
  const VECTOR_HEADER = 't=1704110400,v1=56aff06dc227db80d6568a5070f912c601c31f20451745d257cbc0b5dfa93805';

  it('verifies', () => {
    expect(verifyQontoSignature(Buffer.from(VECTOR_BODY), VECTOR_HEADER, VECTOR_SECRET).valid).toBe(true);
  });
  it('rejects a changed body', () => {
    expect(verifyQontoSignature(Buffer.from('{"test": "data"}'), VECTOR_HEADER, VECTOR_SECRET).valid).toBe(false);
  });
});

describe('verifyQontoSignature', () => {
  const body = Buffer.from(JSON.stringify(transaction));

  it('accepts a valid signature', () => {
    expect(verifyQontoSignature(body, header(body), SECRET).valid).toBe(true);
  });
  it('uses the whole whsec_ secret as a plain key (not base64-decoded, prefix kept)', () => {
    const stripped = SECRET.slice('whsec_'.length);
    const decoded = Buffer.from(stripped, 'base64');
    const bad1 = `t=1704110400,v1=${sign(body, '1704110400', stripped)}`;
    const bad2 = `t=1704110400,v1=${crypto.createHmac('sha256', decoded).update(Buffer.concat([Buffer.from('1704110400.'), body])).digest('hex')}`;
    expect(verifyQontoSignature(body, bad1, SECRET).valid).toBe(false);
    expect(verifyQontoSignature(body, bad2, SECRET).valid).toBe(false);
  });
  it('accepts uppercase hex', () => {
    const h = `t=1704110400,v1=${sign(body, '1704110400').toUpperCase()}`;
    expect(verifyQontoSignature(body, h, SECRET).valid).toBe(true);
  });
  it('accepts any matching v1 entry and ignores other keys', () => {
    const good = sign(body, '1704110400');
    const wrong = 'a'.repeat(64);
    expect(verifyQontoSignature(body, `t=1704110400,v1=${wrong},v1=${good}`, SECRET).valid).toBe(true);
    expect(verifyQontoSignature(body, `t=1704110400,v0=${good},v1=${good}`, SECRET).valid).toBe(true);
    expect(verifyQontoSignature(body, `t=1704110400,v0=${good}`, SECRET).valid).toBe(false);
  });
  it('signs t exactly as sent (no number re-formatting)', () => {
    expect(verifyQontoSignature(body, header(body, '01704110400'), SECRET).valid).toBe(true);
    const h = `t=1704110400,v1=${sign(body, '01704110400')}`;
    expect(verifyQontoSignature(body, h, SECRET).valid).toBe(false);
  });
  it('verifies raw bytes that are not valid UTF-8', () => {
    const bytes = Buffer.from([0x7b, 0xff, 0xfe, 0x7d]);
    expect(verifyQontoSignature(bytes, header(bytes), SECRET).valid).toBe(true);
    expect(verifyQontoSignature(Buffer.from(bytes.toString('utf8')), header(bytes), SECRET).valid).toBe(false);
  });
  it.each([
    ['empty header', ''],
    ['no t', 'v1=' + 'a'.repeat(64)],
    ['empty t', 't=,v1=' + 'a'.repeat(64)],
    ['no v1', 't=1704110400'],
    ['short v1', 't=1704110400,v1=abcd'],
    ['non-hex v1 of correct length', 't=1704110400,v1=' + 'z'.repeat(64)],
    ['garbage', 'not a signature'],
  ])('rejects %s', (_name, h) => {
    expect(verifyQontoSignature(body, h, SECRET).valid).toBe(false);
  });
  it('ignores the timestamp by default but enforces an opt-in tolerance', () => {
    const old = header(body, '1000000000');
    expect(verifyQontoSignature(body, old, SECRET).valid).toBe(true);
    expect(verifyQontoSignature(body, old, SECRET, 300).valid).toBe(false);
    const now = String(Math.floor(Date.now() / 1000));
    expect(verifyQontoSignature(body, header(body, now), SECRET, 300).valid).toBe(true);
  });
});

describe('POST /webhooks/qonto', () => {
  beforeEach(() => {
    process.env.QONTO_WEBHOOK_SECRET = SECRET;
    delete process.env.QONTO_WEBHOOK_TOLERANCE_SECONDS;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.QONTO_WEBHOOK_SECRET;
    delete process.env.QONTO_WEBHOOK_TOLERANCE_SECONDS;
  });

  it.each([
    ['transactions', transaction],
    ['cards', card],
    ['transfers', transfer],
  ])('accepts a signed v1/%s event', async (_n, payload) => {
    const body = JSON.stringify(payload);
    const res = await post(body, header(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts the published vector end to end (secret test-secret)', async () => {
    process.env.QONTO_WEBHOOK_SECRET = 'test-secret';
    const res = await post('{"test":"data"}', 't=1704110400,v1=56aff06dc227db80d6568a5070f912c601c31f20451745d257cbc0b5dfa93805');
    expect(res.status).toBe(200);
  });

  it('verifies bodies sent with any content type', async () => {
    const body = JSON.stringify(transaction);
    expect((await post(body, header(body), 'text/plain')).status).toBe(200);
  });

  it('returns 401 for a missing header', async () => {
    expect((await post(JSON.stringify(transaction))).status).toBe(401);
  });
  it('returns 401 for a wrong secret', async () => {
    const body = JSON.stringify(transaction);
    expect((await post(body, header(body, '1704110400', 'another-secret-another-secret-123456'))).status).toBe(401);
  });
  it('returns 401 when the body was altered', async () => {
    const body = JSON.stringify(transaction);
    expect((await post(body.replace('50.01', '5000.01'), header(body))).status).toBe(401);
  });
  it('returns 400 for a validly signed non-JSON body', async () => {
    expect((await post('not json', header('not json'))).status).toBe(400);
  });
  it('returns 500 when the secret is not configured', async () => {
    delete process.env.QONTO_WEBHOOK_SECRET;
    const body = JSON.stringify(transaction);
    expect((await post(body, header(body))).status).toBe(500);
  });
  it('rejects stale timestamps only when a tolerance is configured', async () => {
    const body = JSON.stringify(transaction);
    expect((await post(body, header(body, '1000000000'))).status).toBe(200);
    process.env.QONTO_WEBHOOK_TOLERANCE_SECONDS = '300';
    expect((await post(body, header(body, '1000000000'))).status).toBe(401);
  });
});

describe('handleQontoEvent', () => {
  let log: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { log = vi.spyOn(console, 'log').mockImplementation(() => {}); });
  afterEach(() => vi.restoreAllMocks());

  it('dispatches on the top-level type and reports data.event', () => {
    handleQontoEvent(transaction);
    expect(log.mock.calls[0][0]).toMatch(/^Transaction created/);
    handleQontoEvent(card);
    expect(log.mock.calls[1][0]).toMatch(/^Card created/);
    handleQontoEvent(transfer);
    expect(log.mock.calls[2][0]).toMatch(/^Transfer created/);
  });
  it('logs unhandled types', () => {
    handleQontoEvent({ type: 'v1/accounts', data: { event: 'created' } });
    expect(log.mock.calls[0][0]).toBe('Unhandled Qonto event: v1/accounts created');
  });
});
