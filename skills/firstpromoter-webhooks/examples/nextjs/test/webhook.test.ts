import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/firstpromoter/route';
import { verifyFirstPromoterRequest, seenEvents } from '../lib/verify-firstpromoter';

const HEADER = 'X-Webhook-Secret';
const SECRET = 'Bearer test_firstpromoter_secret_0123456789';

type Payload = Record<string, unknown>;

beforeAll(() => {
  process.env.FIRSTPROMOTER_WEBHOOK_HEADER = HEADER;
  process.env.FIRSTPROMOTER_WEBHOOK_SECRET = SECRET;
});

beforeEach(() => seenEvents.clear());

// Payloads as shown in FirstPromoter's docs (https://docs.firstpromoter.com/webhooks-v2/payload)
const PROMOTER_CREATED: Payload = {
  event_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  event_type: 'promoter.created',
  action: 'created',
  entity_type: 'promoter',
  entity_id: 12345,
  changes: {},
  data: {
    id: 12345,
    email: 'jane@example.com',
    name: 'Jane Smith',
    cust_id: 'cus_abc123',
    balances: {},
    joined_at: '2025-01-15T10:30:00Z',
    profile: { id: 98765, first_name: 'Jane', last_name: 'Smith', country: 'US' }
  },
  timestamp: '2025-01-15T10:30:00Z'
};

const REFERRAL_UPDATED: Payload = {
  event_id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  event_type: 'referral.updated',
  action: 'updated',
  entity_type: 'referral',
  entity_id: 55678,
  changes: {
    state: ['signup', 'active'],
    customer_since: [null, '2025-01-20T14:00:00Z']
  },
  data: {
    id: 55678,
    state: 'active',
    email: 'user@example.com',
    uid: 'user_ext_id',
    customer_since: '2025-01-20T14:00:00Z',
    fraud_check: 'no_suspicion',
    created_at: '2025-01-18T09:00:00Z'
  },
  timestamp: '2025-01-20T14:00:05Z'
};

const COMMISSION_UPDATED: Payload = {
  event_id: 'c3d4e5f6-a7b8-9012-cdef-012345678902',
  event_type: 'commission.updated',
  action: 'updated',
  entity_type: 'commission',
  entity_id: 88901,
  changes: { status: ['pending', 'approved'] },
  data: {
    id: 88901,
    status: 'approved',
    amount: 2500,
    unit: 'cash',
    referral: { id: 55678, email: 'user@example.com', uid: 'user_ext_id' },
    created_at: '2025-01-18T09:00:00Z'
  },
  timestamp: '2025-01-21T11:15:00Z'
};

const CONTRACT_SIGNED: Payload = {
  event_id: 'd4e5f6a7-b8c9-0123-defa-123456789012',
  event_type: 'contract_document.signed',
  action: 'updated',
  entity_type: 'contract_document',
  entity_id: 4421,
  changes: { signed_at: [null, '2025-01-22T08:45:00Z'] },
  data: { id: 4421, promoter_id: 12345, signed_at: '2025-01-22T08:45:00Z', created_at: '2025-01-10T12:00:00Z' },
  timestamp: '2025-01-22T08:45:03Z'
};

const EVENTS = [
  'promoter.created', 'promoter.updated', 'promoter.deleted', 'promoter.balance.updated',
  'referral.created', 'referral.updated', 'referral.converted', 'referral.cancelled',
  'referral.deleted', 'referral.moved', 'commission.created', 'commission.updated',
  'commission.approved', 'commission.pending', 'commission.denied', 'commission.deleted',
  'payout.created', 'payout.completed', 'payout.failed', 'contract_document.signed'
];

let counter = 0;
function samplePayload(eventType: string): Payload {
  const [entity, action] = eventType.split('.');
  return {
    event_id: `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
    event_type: eventType,
    action: action === 'created' ? 'created' : action === 'deleted' ? 'deleted' : 'updated',
    entity_type: entity,
    entity_id: 1,
    changes: {},
    data: { id: 1, amount: 2500, unit: 'cash', email: 'user@example.com', promoter_id: 12345 },
    timestamp: '2025-01-21T11:15:00Z',
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(PROMOTER_CREATED)
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/firstpromoter', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

function logged(spy: ReturnType<typeof vi.spyOn>, prefix: string): number {
  return spy.mock.calls.filter(([m]) => String(m).startsWith(prefix)).length;
}

describe('POST /webhooks/firstpromoter', () => {
  describe('secret header verification', () => {
    it('accepts the correct header value', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ [HEADER.toLowerCase()]: SECRET }));
      expect(res.status).toBe(200);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'x'.repeat(SECRET.length) }));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await POST(makeRequest({ [HEADER]: 'short' }));
      expect(res.status).toBe(401);
    });

    it('compares the whole value: a stripped Bearer prefix is rejected', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET.replace(/^Bearer /, '') }));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await POST(makeRequest());
      expect(res.status).toBe(401);
    });

    it('rejects the secret sent in a different header', async () => {
      const res = await POST(makeRequest({ Authorization: SECRET }));
      expect(res.status).toBe(401);
    });

    it('rejects everything when no secret is configured', () => {
      const headers = new Headers({ [HEADER]: SECRET });
      expect(verifyFirstPromoterRequest(headers, '', HEADER)).toBe(false);
      expect(verifyFirstPromoterRequest(headers, SECRET, HEADER)).toBe(true);
    });

    it('defaults the header name to Authorization', () => {
      const saved = process.env.FIRSTPROMOTER_WEBHOOK_HEADER;
      delete process.env.FIRSTPROMOTER_WEBHOOK_HEADER;
      expect(verifyFirstPromoterRequest(new Headers({ authorization: SECRET }), SECRET)).toBe(true);
      expect(verifyFirstPromoterRequest(new Headers({ [HEADER]: SECRET }), SECRET)).toBe(false);
      process.env.FIRSTPROMOTER_WEBHOOK_HEADER = saved;
    });
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const req = new NextRequest('http://localhost:3000/webhooks/firstpromoter', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', [HEADER]: SECRET },
        body: JSON.stringify(PROMOTER_CREATED),
      });
      expect((await POST(req)).status).toBe(200);
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
    it.each([PROMOTER_CREATED, REFERRAL_UPDATED, COMMISSION_UPDATED, CONTRACT_SIGNED])(
      'handles the documented $event_type payload',
      async (payload) => {
        const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(payload)));
        expect(res.status).toBe(200);
        expect(logged(spy, 'Unhandled')).toBe(0);
        spy.mockRestore();
      }
    );

    it.each(EVENTS)('handles %s', async (eventType) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload(eventType)))
      );
      expect(res.status).toBe(200);
      expect(logged(spy, 'Unhandled')).toBe(0);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(
        makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload('payout_method.created')))
      );
      expect(res.status).toBe(200);
      expect(spy).toHaveBeenCalledWith('Unhandled event: payout_method.created');
      spy.mockRestore();
    });

    it('acknowledges a repeated event_id without reprocessing it', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const body = JSON.stringify(COMMISSION_UPDATED);
      const first = await POST(makeRequest({ [HEADER]: SECRET }, body));
      const second = await POST(makeRequest({ [HEADER]: SECRET }, body));
      expect(await first.json()).toEqual({ received: true });
      expect(second.status).toBe(200);
      expect(await second.json()).toEqual({ received: true, duplicate: true });
      expect(logged(spy, 'Commission updated')).toBe(1);
      spy.mockRestore();
    });
  });
});
