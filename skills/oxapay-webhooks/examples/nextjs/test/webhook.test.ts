import crypto from 'crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// OxaPay signs with the merchant API key (payments) or payout API key (payouts)
const SECRET = 'OXAPAY_TEST_MERCHANT_API_KEY';
process.env.OXAPAY_WEBHOOK_SECRET = SECRET;

import { POST } from '../app/webhooks/oxapay/route';
import { verifyOxapaySignature } from '../lib/oxapay';

function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha512', secret).update(body).digest('hex');
}

const paidPayment = JSON.stringify({
  track_id: '151811887',
  status: 'Paid',
  type: 'invoice',
  module_name: 'OxaPay',
  amount: 10,
  currency: 'POL',
  order_id: 'ORD-12345',
  date: 1738493900,
  txs: [{ status: 'confirmed', tx_hash: 'x', network: 'Polygon Network' }],
});

const payoutBody = (status: string) =>
  JSON.stringify({
    track_id: '227296189',
    status,
    type: 'payout',
    tx_hash: 'x',
    address: 'x',
    amount: 10.0,
    currency: 'POL',
    network: 'Polygon Network',
    date: 1738492316,
  });

function makeRequest(body: string, signature?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'Content-Type': contentType };
  if (signature !== undefined) headers['HMAC'] = signature;
  return new NextRequest('http://localhost:3000/webhooks/oxapay', {
    method: 'POST',
    headers,
    body,
  });
}

describe('verifyOxapaySignature', () => {
  const body = Buffer.from(paidPayment);

  it('accepts a valid signature, including uppercase hex', () => {
    expect(verifyOxapaySignature(body, sign(paidPayment), SECRET)).toBe(true);
    expect(verifyOxapaySignature(body, sign(paidPayment).toUpperCase(), SECRET)).toBe(true);
  });

  it('rejects wrong secret, tampered body and missing inputs', () => {
    expect(verifyOxapaySignature(body, sign(paidPayment, 'other'), SECRET)).toBe(false);
    expect(verifyOxapaySignature(Buffer.from(paidPayment + ' '), sign(paidPayment), SECRET)).toBe(false);
    expect(verifyOxapaySignature(body, null, SECRET)).toBe(false);
    expect(verifyOxapaySignature(body, '', SECRET)).toBe(false);
    expect(verifyOxapaySignature(body, sign(paidPayment), undefined)).toBe(false);
  });

  it('rejects malformed signatures without decoding them', () => {
    const good = sign(paidPayment);
    expect(verifyOxapaySignature(body, good.slice(0, 126), SECRET)).toBe(false);
    expect(verifyOxapaySignature(body, good + '00', SECRET)).toBe(false);
    expect(verifyOxapaySignature(body, 'zz' + good.slice(2), SECRET)).toBe(false);
    expect(verifyOxapaySignature(body, `sha512=${good}`, SECRET)).toBe(false);
  });
});

describe('POST /webhooks/oxapay', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('answers a verified payment callback with 200 and the body "ok"', async () => {
    const res = await POST(makeRequest(paidPayment, sign(paidPayment)));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('paid'));
  });

  it.each(['Confirming', 'Confirmed', 'Failed'])('handles payout status %s', async (status) => {
    const body = payoutBody(status);
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(`Payout 227296189 ${status.toLowerCase()}`));
  });

  it('handles Paying', async () => {
    const body = JSON.stringify({ track_id: '1', status: 'Paying', type: 'invoice' });
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('paying'));
  });

  it('logs and acknowledges unknown statuses', async () => {
    const body = JSON.stringify({ track_id: '1', status: 'Expired', type: 'invoice' });
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Unhandled OxaPay status: Expired');
  });

  it('verifies the exact bytes whatever the content type', async () => {
    const res = await POST(makeRequest(paidPayment, sign(paidPayment), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('verifies the exact bytes, not re-serialised JSON', async () => {
    const spaced = '{ "track_id": "1",  "status": "Paid", "type": "invoice" }';
    const res = await POST(makeRequest(spaced, sign(spaced)));
    expect(res.status).toBe(200);
  });

  it('returns 401 for a missing, empty, malformed or wrong signature', async () => {
    expect((await POST(makeRequest(paidPayment))).status).toBe(401);
    expect((await POST(makeRequest(paidPayment, ''))).status).toBe(401);
    expect((await POST(makeRequest(paidPayment, 'not-hex'))).status).toBe(401);
    expect((await POST(makeRequest(paidPayment, sign(paidPayment, 'wrong')))).status).toBe(401);
  });

  it('returns 401 when the body was modified after signing', async () => {
    const res = await POST(makeRequest(paidPayment.replace('Paid', 'Paying'), sign(paidPayment)));
    expect(res.status).toBe(401);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const res = await POST(makeRequest('not json', sign('not json')));
    expect(res.status).toBe(400);
  });
});
