import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/paxos/route';
import { verifyPaxosRequest } from '../lib/verify-paxos';

const HEADER = 'X-Paxos-Webhook-Secret';
const SECRET = 'Bearer test_paxos_secret_0123456789';

const EVENTS = [
  'identity.approved', 'identity.denied', 'identity.documents_required',
  'identity.documents_accepted', 'identity.documents_denied',
  'transfer.crypto_deposit.pending', 'transfer.crypto_deposit.completed',
  'transfer.wire_withdrawal.failed', 'orchestration.processing', 'orchestration.completed',
  'orchestration.failed',
];

beforeAll(() => {
  process.env.PAXOS_WEBHOOK_HEADER = HEADER;
  process.env.PAXOS_WEBHOOK_SECRET = SECRET;
});

function sampleEvent(type = 'identity.approved', extra: Record<string, unknown> = {}) {
  return {
    id: 'bd019f1c-89a7-4372-9d21-eaad9280dc41',
    type,
    source: 'com.paxos',
    time: '2025-01-01T14:30:02Z',
    object: 'event',
    is_test: false,
    ...extra,
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(sampleEvent()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/paxos', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/paxos', () => {
  describe('API key header verification', () => {
    it('accepts the correct header value', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ [HEADER.toUpperCase()]: SECRET }));
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

    it('does not read the secret from a different header', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(401);
    });

    it('rejects everything when PAXOS_WEBHOOK_SECRET is unset', () => {
      const headers = new Headers({ [HEADER]: SECRET });
      expect(verifyPaxosRequest(headers, '')).toBe(false);
      delete process.env.PAXOS_WEBHOOK_SECRET;
      expect(verifyPaxosRequest(headers)).toBe(false);
      process.env.PAXOS_WEBHOOK_SECRET = SECRET;
    });

    it('defaults the header name to Authorization', () => {
      const headers = new Headers({ authorization: 'abc' });
      expect(verifyPaxosRequest(headers, 'abc', 'Authorization')).toBe(true);
      delete process.env.PAXOS_WEBHOOK_HEADER;
      expect(verifyPaxosRequest(headers, 'abc')).toBe(true);
      process.env.PAXOS_WEBHOOK_HEADER = HEADER;
    });
  });

  describe('Body handling', () => {
    it('accepts any content type', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(sampleEvent()), 'text/plain'));
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a body without a type', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '{"id":"1"}'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (type) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(sampleEvent(type))));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('ignores test events', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ [HEADER]: SECRET }, JSON.stringify(sampleEvent('identity.approved', { is_test: true })))
      );
      expect(res.status).toBe(200);
      expect((await res.json()).test).toBe(true);
      expect(spy.mock.calls.some(([m]) => String(m).includes('Identity approved'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(sampleEvent('something.new'))));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });
});
