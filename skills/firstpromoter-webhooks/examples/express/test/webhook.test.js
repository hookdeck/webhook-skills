const request = require('supertest');

// Set test environment variables before importing the app
process.env.FIRSTPROMOTER_WEBHOOK_HEADER = 'X-Webhook-Secret';
process.env.FIRSTPROMOTER_WEBHOOK_SECRET = 'Bearer test_firstpromoter_secret_0123456789';

const app = require('../src/index');
const { verifyFirstPromoterRequest, seenEvents } = require('../src/index');

const HEADER = process.env.FIRSTPROMOTER_WEBHOOK_HEADER;
const SECRET = process.env.FIRSTPROMOTER_WEBHOOK_SECRET;

// Payloads as shown in FirstPromoter's docs (https://docs.firstpromoter.com/webhooks-v2/payload)
const PROMOTER_CREATED = {
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

const REFERRAL_UPDATED = {
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

const COMMISSION_UPDATED = {
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

const CONTRACT_SIGNED = {
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
function samplePayload(eventType) {
  const [entity, action] = eventType.split('.');
  return {
    event_id: `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
    event_type: eventType,
    action: action === 'created' ? 'created' : action === 'deleted' ? 'deleted' : 'updated',
    entity_type: entity,
    entity_id: 1,
    changes: {},
    data: { id: 1, amount: 2500, unit: 'cash', email: 'user@example.com', promoter_id: 12345 },
    timestamp: '2025-01-21T11:15:00Z'
  };
}

function post(body = JSON.stringify(PROMOTER_CREATED), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/firstpromoter')
    .set('Content-Type', contentType)
    .send(body);
}

beforeEach(() => seenEvents.clear());

describe('FirstPromoter webhook endpoint', () => {
  describe('secret header verification', () => {
    it('accepts the correct header value', async () => {
      const res = await post().set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set(HEADER.toLowerCase(), SECRET);
      expect(res.status).toBe(200);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await post().set(HEADER, 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await post().set(HEADER, 'short');
      expect(res.status).toBe(401);
    });

    it('compares the whole value: a stripped Bearer prefix is rejected', async () => {
      const res = await post().set(HEADER, SECRET.replace(/^Bearer /, ''));
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects the secret sent in a different header', async () => {
      const res = await post().set('Authorization', SECRET);
      expect(res.status).toBe(401);
    });

    it('rejects everything when the secret is unset', () => {
      const headers = { 'x-webhook-secret': SECRET };
      expect(verifyFirstPromoterRequest(headers, '', HEADER)).toBe(false);
      expect(verifyFirstPromoterRequest(headers, SECRET, HEADER)).toBe(true);
    });

    it('defaults the header name to Authorization', () => {
      const saved = process.env.FIRSTPROMOTER_WEBHOOK_HEADER;
      delete process.env.FIRSTPROMOTER_WEBHOOK_HEADER;
      expect(verifyFirstPromoterRequest({ authorization: SECRET })).toBe(true);
      expect(verifyFirstPromoterRequest({ 'x-webhook-secret': SECRET })).toBe(false);
      process.env.FIRSTPROMOTER_WEBHOOK_HEADER = saved;
    });
  });

  describe('body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(PROMOTER_CREATED), 'text/plain').set(HEADER, SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await post('[1,2]').set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without the header', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('event handling', () => {
    it.each([PROMOTER_CREATED, REFERRAL_UPDATED, COMMISSION_UPDATED, CONTRACT_SIGNED])(
      'handles the documented $event_type payload',
      async (payload) => {
        const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
        const res = await post(JSON.stringify(payload)).set(HEADER, SECRET);
        expect(res.status).toBe(200);
        expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
        spy.mockRestore();
      }
    );

    it.each(EVENTS)('handles %s', async (eventType) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload(eventType))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload('payout_method.created'))).set(HEADER, SECRET);
      expect(res.status).toBe(200);
      expect(spy).toHaveBeenCalledWith('Unhandled event: payout_method.created');
      spy.mockRestore();
    });

    it('acknowledges a repeated event_id without reprocessing it', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const first = await post(JSON.stringify(COMMISSION_UPDATED)).set(HEADER, SECRET);
      const second = await post(JSON.stringify(COMMISSION_UPDATED)).set(HEADER, SECRET);
      expect(first.body).toEqual({ received: true });
      expect(second.status).toBe(200);
      expect(second.body).toEqual({ received: true, duplicate: true });
      expect(spy.mock.calls.filter(([m]) => String(m).startsWith('Commission updated'))).toHaveLength(1);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
