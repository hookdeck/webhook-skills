import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../app/webhooks/loyaltylion/route';
import { verifyLoyaltyLionSignature } from '../lib/verify-loyaltylion';

// LoyaltyLion secrets are opaque strings (OAuth client secret or site secret): used as UTF-8 bytes
const SECRET = 'test_loyaltylion_secret_abc123';
const HEADER = 'x-loyaltylion-hmac-sha256';
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const sign = (body: string, secret = SECRET) =>
  crypto.createHmac('sha256', secret).update(body).digest('base64');

const customer = {
  id: 6932,
  merchant_id: '2134606599',
  email: 'jessica@example.com',
  points_approved: 200,
  points_pending: 300,
  enrolled: true,
};
const envelope = (topic: string, payload: unknown) => ({
  id: 'bff1bddb-6cd8-4c2c-9619-18744657053c',
  topic,
  created_at: '2025-01-01T03:00:05.000Z',
  payload,
});

const events: Record<string, unknown> = {
  'program_events/customer.enrolled': envelope('program_events/customer.enrolled', {
    properties: { customer, enrollment: { date: '2025-01-01T02:55:00.000Z', trigger: 'account_creation' } },
  }),
  'program_events/customer.points_earned': envelope('program_events/customer.points_earned', {
    properties: { customer, transaction: { id: '5432', points_approved: '1200' } },
  }),
  'program_events/customer.claimed_reward': envelope('program_events/customer.claimed_reward', {
    properties: { title: '$5 voucher', customer, reward_type: 'voucher', voucher_code: 'LL-PQ8V63' },
  }),
  // Docs example: customer sits at the top level, not under payload
  'customers/update': {
    id: 'bff1bddb-6cd8-4c2c-9619-18744657053c',
    topic: 'customers/update',
    created_at: '2025-01-01T03:00:05.000Z',
    customer,
  },
  'loyalty_emails/unsubscribe': envelope('loyalty_emails/unsubscribe', {
    unsubscribe: { customer: { id: 6936, email: 'sarah@example.com' } },
  }),
  'receipts/manual_approval_required': envelope('receipts/manual_approval_required', {
    customer,
    receipt: { id: 42, status: 'awaiting_manual_review' },
    rule: { id: 1234, name: '$retail_purchase' },
  }),
  // No envelope and no topic: posted to a custom reward's fulfilment URL
  'rewards/store_fulfilment': {
    test: false,
    reward_fulfilment_id: 1823,
    reward_id: 6,
    reward_identifier: 'surprise-gift-next-order',
    customer_id: 5,
    customer_merchant_id: '2075071365',
    customer_email: 'jesca.blue@example.com',
  },
};

function post(raw: string, headers: Record<string, string> = {}, contentType = 'application/json') {
  return POST(
    new NextRequest('http://localhost:3000/webhooks/loyaltylion', {
      method: 'POST',
      headers: { 'content-type': contentType, ...headers },
      body: raw,
    })
  );
}

describe('LoyaltyLion webhook route', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    process.env.LOYALTYLION_WEBHOOK_SECRET = SECRET;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('valid signatures', () => {
    it.each(Object.keys(events))('accepts %s', async (topic) => {
      const raw = JSON.stringify(events[topic]);
      const res = await post(raw, { [HEADER]: sign(raw) });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('dispatches on topic', async () => {
      const raw = JSON.stringify(events['program_events/customer.enrolled']);
      await post(raw, { [HEADER]: sign(raw) });
      expect(logSpy).toHaveBeenCalledWith('Customer 6932 enrolled in the loyalty program');
    });

    it('recognises the topic-less rewards/store_fulfilment body', async () => {
      const raw = JSON.stringify(events['rewards/store_fulfilment']);
      await post(raw, { [HEADER]: sign(raw) });
      expect(logSpy).toHaveBeenCalledWith('Fulfilment 1823 for reward surprise-gift-next-order');
    });

    it('logs unknown topics and still returns 200', async () => {
      const raw = JSON.stringify(
        envelope('program_events/customer.moved_to_loyal_segment', { properties: { customer } })
      );
      const res = await post(raw, { [HEADER]: sign(raw) });
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Unhandled LoyaltyLion topic: program_events/customer.moved_to_loyal_segment');
    });

    it('verifies the exact bytes, whatever the content type', async () => {
      const raw = JSON.stringify(events['customers/update'], null, 2);
      const res = await post(raw, { [HEADER]: sign(raw) }, 'text/plain');
      expect(res.status).toBe(200);
    });
  });

  describe('invalid signatures', () => {
    const raw = JSON.stringify(events['customers/update']);

    it('rejects a missing header', async () => {
      expect((await post(raw)).status).toBe(401);
    });

    it('rejects an empty header', async () => {
      expect((await post(raw, { [HEADER]: '' })).status).toBe(401);
    });

    it('rejects a signature made with the wrong secret', async () => {
      expect((await post(raw, { [HEADER]: sign(raw, 'wrong_secret') })).status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      const res = await post(raw.replace('6932', '9999'), { [HEADER]: sign(raw) });
      expect(res.status).toBe(401);
    });

    it('rejects a re-serialised body (signature covers the raw bytes)', async () => {
      const pretty = JSON.stringify(JSON.parse(raw), null, 2);
      expect((await post(pretty, { [HEADER]: sign(raw) })).status).toBe(401);
    });

    it('rejects a hex digest', async () => {
      const hex = crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
      expect((await post(raw, { [HEADER]: hex })).status).toBe(401);
    });

    it('rejects a prefixed or unpadded value', async () => {
      const sig = sign(raw);
      expect((await post(raw, { [HEADER]: `sha256=${sig}` })).status).toBe(401);
      expect((await post(raw, { [HEADER]: sig.slice(0, -1) })).status).toBe(401);
    });

    it('rejects base64 with stray low bits in the last character', async () => {
      const sig = sign(raw);
      // The 43rd char carries 4 data bits + 2 unused bits: flipping the lowest bit decodes to
      // the same bytes but is a different string, and must be rejected.
      const twin = sig.slice(0, 42) + ALPHABET[ALPHABET.indexOf(sig[42]) ^ 1] + '=';
      expect(Buffer.from(twin, 'base64').equals(Buffer.from(sig, 'base64'))).toBe(true);
      expect((await post(raw, { [HEADER]: twin })).status).toBe(401);
    });

    it('rejects a case-changed signature', async () => {
      expect((await post(raw, { [HEADER]: sign(raw).toLowerCase() })).status).toBe(401);
    });
  });

  describe('request handling', () => {
    it('returns 400 for a validly signed body that is not JSON', async () => {
      const raw = 'not json';
      expect((await post(raw, { [HEADER]: sign(raw) })).status).toBe(400);
    });

    it('returns 400 for a validly signed JSON array', async () => {
      const raw = '[]';
      expect((await post(raw, { [HEADER]: sign(raw) })).status).toBe(400);
    });

    it('returns 500 when the secret is not configured', async () => {
      delete process.env.LOYALTYLION_WEBHOOK_SECRET;
      const raw = '{}';
      expect((await post(raw, { [HEADER]: sign(raw) })).status).toBe(500);
    });
  });

  describe('verifyLoyaltyLionSignature', () => {
    const body = Buffer.from('{"a":1}');
    it('accepts the correct signature', () => {
      expect(verifyLoyaltyLionSignature(body, sign(body.toString()), SECRET)).toBe(true);
    });
    it('rejects missing and empty signatures', () => {
      expect(verifyLoyaltyLionSignature(body, undefined, SECRET)).toBe(false);
      expect(verifyLoyaltyLionSignature(body, null, SECRET)).toBe(false);
      expect(verifyLoyaltyLionSignature(body, '', SECRET)).toBe(false);
    });
    it('rejects when no secret is configured', () => {
      expect(verifyLoyaltyLionSignature(body, sign(body.toString()), undefined)).toBe(false);
    });
  });
});
