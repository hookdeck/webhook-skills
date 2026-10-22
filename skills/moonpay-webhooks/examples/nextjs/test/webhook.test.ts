import { describe, it, expect, beforeAll, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { verifyMoonpayWebhook } from '../lib/moonpay';

// MoonPay webhook API keys look like wk_test_xxxxx and are used as a plain string
const API_KEY = 'wk_test_123';

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.MOONPAY_WEBHOOK_API_KEY = API_KEY;
  ({ POST } = await import('../app/webhooks/moonpay/route'));
});

function sign(body: string, key = API_KEY, t = Math.floor(Date.now() / 1000)): string {
  const s = crypto.createHmac('sha256', key).update(`${t}.${body}`).digest('hex');
  return `t=${t},s=${s}`;
}

function makeRequest(body: string, header?: string, contentType = 'application/json'): NextRequest {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (header) headers['moonpay-signature-v2'] = header;
  return new NextRequest('http://localhost:3000/webhooks/moonpay', {
    method: 'POST',
    headers,
    body,
  });
}

describe('verifyMoonpayWebhook', () => {
  const body = JSON.stringify({ type: 'transaction_created', data: { id: 'tx_1' } });
  const now = () => Math.floor(Date.now() / 1000);

  it('accepts a valid signature', () => {
    expect(verifyMoonpayWebhook(body, sign(body), API_KEY)).toBe(true);
  });

  it('matches the documented header shape', () => {
    expect(sign(body)).toMatch(/^t=\d+,s=[0-9a-f]{64}$/);
  });

  it('rejects wrong key', () => {
    expect(verifyMoonpayWebhook(body, sign(body, 'wk_test_other'), API_KEY)).toBe(false);
  });

  it('rejects tampered body', () => {
    expect(verifyMoonpayWebhook(body + ' ', sign(body), API_KEY)).toBe(false);
  });

  it('accepts an old timestamp by default (retries keep the original t)', () => {
    vi.stubEnv('MOONPAY_TIMESTAMP_TOLERANCE_SECONDS', '');
    expect(verifyMoonpayWebhook(body, sign(body, API_KEY, now() - 86400), API_KEY)).toBe(true);
    vi.unstubAllEnvs();
  });

  it('rejects an old timestamp with an explicit tolerance', () => {
    expect(verifyMoonpayWebhook(body, sign(body, API_KEY, now() - 600), API_KEY, 300)).toBe(false);
  });

  it('rejects an old timestamp when MOONPAY_TIMESTAMP_TOLERANCE_SECONDS is set', () => {
    vi.stubEnv('MOONPAY_TIMESTAMP_TOLERANCE_SECONDS', '300');
    expect(verifyMoonpayWebhook(body, sign(body, API_KEY, now() - 600), API_KEY)).toBe(false);
    vi.unstubAllEnvs();
  });

  it('treats a non-numeric tolerance as 0 (check off)', () => {
    vi.stubEnv('MOONPAY_TIMESTAMP_TOLERANCE_SECONDS', 'five minutes');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(verifyMoonpayWebhook(body, sign(body, API_KEY, now() - 600), API_KEY)).toBe(true);
    warn.mockRestore();
    vi.unstubAllEnvs();
  });

  it('stale timestamp passes with a wider tolerance', () => {
    expect(verifyMoonpayWebhook(body, sign(body, API_KEY, now() - 600), API_KEY, 900)).toBe(true);
  });

  it('rejects malformed or missing headers', () => {
    expect(verifyMoonpayWebhook(body, 'garbage', API_KEY)).toBe(false);
    expect(verifyMoonpayWebhook(body, 't=abc,s=00', API_KEY)).toBe(false);
    expect(verifyMoonpayWebhook(body, `t=${now()}`, API_KEY)).toBe(false);
    expect(verifyMoonpayWebhook(body, null, API_KEY)).toBe(false);
  });
});

describe('POST /webhooks/moonpay', () => {
  const events = [
    { type: 'transaction_created', data: { id: 'tx_1', status: 'waitingPayment' } },
    { type: 'transaction_updated', data: { id: 'tx_1', status: 'completed' } },
    { type: 'transaction_failed', data: { id: 'tx_1', status: 'failed', failureReason: 'card_not_supported' } },
    { type: 'sell_transaction_created', data: { id: 'stx_1', status: 'waitingForDeposit' } },
    { type: 'sell_transaction_updated', data: { id: 'stx_1', status: 'completed' } },
    { type: 'sell_transaction_failed', data: { id: 'stx_1', status: 'failed' } },
    { type: 'sell_transaction_requote_required', data: { id: 'stx_1' } },
    { type: 'identity_check_updated', data: { id: 'ic_1', status: 'completed' } },
    { id: 'evt_1', type: 'customer.identity_status_updated', timestamp: '2026-01-01T00:00:00Z', data: { customerId: 'cus_1', status: 'verified' } },
    { type: 'somethingNew', data: {} },
  ];

  it.each(events)('returns 200 for a valid $type event', async (event) => {
    const body = JSON.stringify(event);
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
  });

  it('verifies a body sent with a non-JSON content type', async () => {
    const body = JSON.stringify(events[0]);
    const res = await POST(makeRequest(body, sign(body), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 400 for an invalid signature', async () => {
    const body = JSON.stringify(events[0]);
    const res = await POST(makeRequest(body, sign(body, 'wk_test_wrong')));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a missing header', async () => {
    const res = await POST(makeRequest(JSON.stringify(events[0])));
    expect(res.status).toBe(400);
  });

  it('returns 400 for validly signed invalid JSON', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(400);
  });
});
