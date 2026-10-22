import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/nium/route';
import { verifyNiumRequest } from '../lib/verify-nium';

const HEADER = 'x-partner-key';
// The configured value includes a 'Bearer ' prefix: it is compared whole, never parsed.
const SECRET = 'Bearer test_nium_secret_0123456789';

const TEMPLATES = [
  'CUSTOMER_STATUS_WEBHOOK', 'CUSTOMER_ODD_STATUS_WEBHOOK', 'CARD_CLIENT_KYB_STATUS_WEBHOOK',
  'REMIT_TRANSACTION_INITIATED_WEBHOOK', 'REMIT_TRANSACTION_PAID_WEBHOOK',
  'REMIT_TRANSACTION_REJECTED_WEBHOOK', 'REMIT_TRANSACTION_RETURNED_WEBHOOK',
  'FX_CONVERSION_COMPLETED_WEBHOOK', 'FX_CONVERSION_FAILED_WEBHOOK', 'FX_CONVERSION_CANCELLED_WEBHOOK',
  'CARD_POS_APPROVED_WEBHOOK', 'CARD_ATM_APPROVED_WEBHOOK', 'CARD_WALLET_FUNDING_WEBHOOK',
  'VIRTUAL_ACCOUNT_ASSIGNED_WEBHOOK', 'INCOMING_FUNDS_WEBHOOK'
];
const RFI_STATUSES = ['RFI_REQUESTED', 'RFI_RESPONDED', 'RFI_CLOSED'];

beforeAll(() => {
  process.env.NIUM_WEBHOOK_HEADER = HEADER;
  process.env.NIUM_WEBHOOK_SECRET = SECRET;
});

function samplePayload(template = 'REMIT_TRANSACTION_PAID_WEBHOOK') {
  return {
    clientHashId: '0498f10f-1968-494f-9f7a-454ed23942a0',
    customerHashId: '0de1e512-e0d7-4eca-ad41-dd39325facc2',
    walletHashId: 'e83cca77-8b63-4a25-b580-1d872380ef29',
    systemReferenceNumber: 'RT1343085439',
    template,
  };
}

function rfiPayload(status: string) {
  return {
    clientHashId: 'b1cb53e3-6a1b-4b58-a10d-5a79c5967cef',
    customerHashId: '85c21489-94aa-4e65-ab7e-1c6bcea84e27',
    rfiDetails: { rfiId: 'rfi_7f3a9c12', status, query: 'Please provide the source of funds.' },
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/nium', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

function logged(spy: ReturnType<typeof vi.spyOn>): string[] {
  return spy.mock.calls.map(([m]) => String(m));
}

describe('POST /webhooks/nium', () => {
  describe('static header authentication', () => {
    it('accepts the correct value', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ 'X-Partner-Key': SECRET }));
      expect(res.status).toBe(200);
    });

    it('compares the whole value, including the Bearer prefix', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET.replace('Bearer ', '') }));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('does not accept the secret under a different header', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(401);
    });

    it('rejects everything when the secret is unconfigured', () => {
      const headers = new Headers({ [HEADER]: SECRET });
      expect(verifyNiumRequest(headers, '')).toBe(false);
      expect(verifyNiumRequest(headers, SECRET)).toBe(true);
    });

    it('honours a user-chosen header name', () => {
      expect(verifyNiumRequest(new Headers({ 'x-acme-token': SECRET }), SECRET, 'X-Acme-Token')).toBe(true);
      expect(verifyNiumRequest(new Headers({ [HEADER]: SECRET }), SECRET, 'X-Acme-Token')).toBe(false);
    });
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload()), 'text/plain'));
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('event handling', () => {
    it.each(TEMPLATES)('handles %s', async (template) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload(template))));
      expect(res.status).toBe(200);
      expect(logged(spy).some((m) => m.startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it.each(RFI_STATUSES)('handles RFI event %s (rfiDetails.status)', async (status) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(rfiPayload(status))));
      expect(res.status).toBe(200);
      expect(logged(spy).some((m) => m.startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown templates', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload('SOMETHING_NEW_WEBHOOK'))));
      expect(res.status).toBe(200);
      expect(logged(spy)).toContain('Unhandled event: SOMETHING_NEW_WEBHOOK');
      spy.mockRestore();
    });
  });
});
