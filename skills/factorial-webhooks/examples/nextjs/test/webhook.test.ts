import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/factorial/route';
import { verifyFactorialRequest } from '../lib/verify-factorial';

const CHALLENGE = '2zal4e6d-test-challenge';
const HEADER = 'x-factorial-wh-challenge';

const TYPES = [
  'employees/employee/create_with_contract', 'employees/employee/update',
  'employees/employee/terminate', 'contracts/contract_version/create',
  'timeoff/leave/create', 'timeoff/leave/approve', 'timeoff/leave/reject',
  'attendance/shift/clock_in', 'ats/application/create', 'ats/candidate/create',
];

beforeAll(() => {
  process.env.FACTORIAL_WH_CHALLENGE = CHALLENGE;
});

// Factorial sends the resource itself: no wrapper, no event field.
function sampleResource() {
  return {
    id: 2,
    full_name: 'Ana Blanco Perez',
    email: 'ana@factorial.com',
    active: true,
    terminated_on: null,
    created_at: '2010-10-06T00:00:00.000Z',
    updated_at: '2026-10-01T10:32:11.000Z',
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(sampleResource()),
  type?: string
): NextRequest {
  const query = type ? `?type=${encodeURIComponent(type)}` : '';
  return new NextRequest(`http://localhost:3000/webhooks/factorial${query}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('POST /webhooks/factorial', () => {
  describe('x-factorial-wh-challenge verification', () => {
    it('accepts the correct challenge', async () => {
      const res = await POST(makeRequest({ [HEADER]: CHALLENGE }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ 'X-Factorial-WH-Challenge': CHALLENGE }));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong challenge of the same length', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'x'.repeat(CHALLENGE.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a challenge of a different length without throwing', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'short' }));
      expect(res.status).toBe(401);
    });

    it('rejects a challenge that only starts with the right value', async () => {
      const res = await POST(makeRequest({ [HEADER]: `${CHALLENGE}-extra` }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('does not accept the challenge as an Authorization bearer', async () => {
      const res = await POST(makeRequest({ Authorization: `Bearer ${CHALLENGE}` }));
      expect(res.status).toBe(401);
    });

    it('rejects everything when no challenge is configured', () => {
      const headers = new Headers({ [HEADER]: CHALLENGE });
      expect(verifyFactorialRequest(headers, '')).toBe(false);
      expect(verifyFactorialRequest(headers, CHALLENGE)).toBe(true);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type', async () => {
      const req = new NextRequest('http://localhost:3000/webhooks/factorial', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', [HEADER]: CHALLENGE },
        body: JSON.stringify(sampleResource()),
      });
      expect((await POST(req)).status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ [HEADER]: CHALLENGE }, '{not json'));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await POST(makeRequest({ [HEADER]: CHALLENGE }, '[1,2]'));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the challenge', async () => {
      const res = await POST(makeRequest({}, '{not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('Subscription type handling', () => {
    it.each(TYPES)('handles %s', async (type) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: CHALLENGE }, JSON.stringify(sampleResource()), type));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges a delivery with no type hint', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: CHALLENGE }));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(true);
      spy.mockRestore();
    });

    it('acknowledges an unknown subscription type', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: CHALLENGE }, JSON.stringify(sampleResource()), 'new/thing/happen'));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });
  });
});
