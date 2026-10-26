import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/tabby/route';
import { verifyTabbyRequest } from '../lib/verify-tabby';

const NAME = 'X-Auth-Key';
const SECRET = 'Bearer test_tabby_secret_0123456789';

beforeAll(() => {
  process.env.TABBY_WEBHOOK_HEADER = NAME;
  process.env.TABBY_WEBHOOK_SECRET = SECRET;
});

function payment(status = 'authorized', extra: Record<string, unknown> = {}) {
  return {
    id: 'pay_123', created_at: '2021-09-14T13:08:54Z', status, is_test: false,
    amount: '100', currency: 'SAR', order: { reference_id: 'order-1' },
    captures: [], refunds: [], ...extra,
  };
}

function dispute(status = 'pending') {
  return {
    status, dispute_id: 'dsp_1', payment_id: 'pay_123', currency: 'SAR',
    created_at: '2026-06-15T13:08:54Z',
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(payment()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/tabby', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

function logged(spy: ReturnType<typeof vi.spyOn>): string[] {
  return spy.mock.calls.map(([m]) => String(m));
}

describe('POST /webhooks/tabby', () => {
  describe('header verification', () => {
    it('accepts the correct header and returns exactly 200', async () => {
      const res = await POST(makeRequest({ [NAME]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ 'x-auth-key': SECRET }));
      expect(res.status).toBe(200);
    });

    it('compares the whole value, including the Bearer prefix', async () => {
      const res = await POST(makeRequest({ [NAME]: SECRET.replace('Bearer ', '') }));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await POST(makeRequest({ [NAME]: 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await POST(makeRequest({ [NAME]: 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects the secret sent under a different header name', async () => {
      const res = await POST(makeRequest({ 'X-Other': SECRET }));
      expect(res.status).toBe(401);
    });

    it('supports a custom header name', () => {
      const ok = new Headers({ 'x-tabby-key': 'abc' });
      expect(verifyTabbyRequest(ok, 'X-Tabby-Key', 'abc')).toBe(true);
      expect(verifyTabbyRequest(ok, 'X-Tabby-Key', 'abd')).toBe(false);
    });

    it('rejects everything when the secret is unset', () => {
      const headers = new Headers({ [NAME]: SECRET });
      expect(verifyTabbyRequest(headers, NAME, '')).toBe(false);
      expect(verifyTabbyRequest(headers, NAME, undefined)).toBe(true); // falls back to env
      delete process.env.TABBY_WEBHOOK_SECRET;
      expect(verifyTabbyRequest(headers)).toBe(false);
      process.env.TABBY_WEBHOOK_SECRET = SECRET;
    });
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const res = await POST(makeRequest({ [NAME]: SECRET }, JSON.stringify(payment()), 'text/plain'));
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ [NAME]: SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest({ [NAME]: SECRET }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('payment dispatch (no event field)', () => {
    const cases: [string, object, string][] = [
      ['authorized, no captures', payment('authorized'), 'Payment authorized'],
      ['authorized with a capture', payment('authorized', { captures: [{ id: 'c1' }] }), 'Payment captured'],
      ['closed', payment('closed'), 'Payment closed:'],
      ['closed with a refund', payment('closed', { refunds: [{ id: 'r1' }] }), 'Payment closed with refunds'],
      ['rejected', payment('rejected'), 'Payment rejected'],
      ['expired', payment('expired'), 'Payment expired'],
    ];

    it.each(cases)('handles %s', async (_name, body, expected) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [NAME]: SECRET }, JSON.stringify(body)));
      expect(res.status).toBe(200);
      expect(logged(spy).some((m) => m.startsWith(expected))).toBe(true);
      spy.mockRestore();
    });

    it('acknowledges unknown statuses', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [NAME]: SECRET }, JSON.stringify(payment('something_new'))));
      expect(res.status).toBe(200);
      expect(logged(spy).some((m) => m.startsWith('Unhandled payment status'))).toBe(true);
      spy.mockRestore();
    });
  });

  describe('dispute dispatch', () => {
    const cases: [string, string][] = [
      ['pending', 'Dispute opened'],
      ['arbitration', 'Dispute in arbitration'],
      ['evidence_merchant', 'Dispute evidence requested'],
      ['approved', 'Dispute approved'],
      ['declined', 'Dispute declined'],
      ['cancelled', 'Dispute cancelled'],
    ];

    it.each(cases)('handles %s', async (status, expected) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [NAME]: SECRET }, JSON.stringify(dispute(status))));
      expect(res.status).toBe(200);
      expect(logged(spy).some((m) => m.startsWith(expected))).toBe(true);
      spy.mockRestore();
    });
  });
});
