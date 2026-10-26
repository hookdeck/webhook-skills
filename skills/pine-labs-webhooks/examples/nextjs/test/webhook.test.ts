// Generated with: pine-labs-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/pine-labs/route';

// Pine Labs' secret key is used as raw UTF-8 bytes (no whsec_ prefix, no base64 decoding).
const SECRET = 'pl_test_secret_key_abc1234';
const OTHER_SECRET = 'pl_some_other_secret_key_999';

process.env.PINE_LABS_WEBHOOK_SECRET = SECRET;

/** Sign like Standard Webhooks: HMAC-SHA256 over `${id}.${timestamp}.${body}`, base64. */
function sign(rawBody: string, id: string, timestamp: string, secret = SECRET): string {
  const sig = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(`${id}.${timestamp}.${rawBody}`).digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);

interface SignOptions {
  prefix?: 'webhook' | 'svix';
  id?: string;
  timestamp?: number | string;
  secret?: string;
  signature?: string;
}

function signedHeaders(rawBody: string, opts: SignOptions = {}): Record<string, string> {
  const prefix = opts.prefix ?? 'webhook';
  const id = opts.id ?? `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(opts.timestamp ?? now());
  return {
    'content-type': 'application/json',
    [`${prefix}-id`]: id,
    [`${prefix}-timestamp`]: ts,
    [`${prefix}-signature`]: opts.signature ?? sign(rawBody, id, ts, opts.secret),
  };
}

function post(rawBody: string, headers: Record<string, string>) {
  return POST(new Request('http://localhost/webhooks/pine-labs', { method: 'POST', headers, body: rawBody }));
}

const order = (status: string) => ({
  order_id: 'v1-240909084141-aa-O2oJwd',
  type: 'CHARGE',
  status,
  order_amount: { value: 200, currency: 'INR' },
});
const refund = (status: string) => ({ ...order(status), order_id: 'v1-240828181713-aa-hNlYwt', parent_order_id: 'v1-241010055924-aa-AHbN0s', type: 'REFUND' });
const customer = (status: string) => ({ customer: { customer_id: 'cust-v1-0811030624-aa-RBDgpR', status } });
const token = (status: string) => ({ token: { token_id: 'token-v1-0811030624-aa-RBDgpR', status } });
const subscription = (status: string) => ({ subscription: { subscription_id: 'v1-sub-4405071524-aa-qlAtAf', status } });
const payout = (status: string) => ({ clientReferenceId: 'Payout_webhook_testing_01', paymentReferenceId: 'txn-e28f0bcb241043c5959815f090e7971e', status });

const events: Record<string, unknown> = {
  CUSTOMER_ACTIVATED: customer('ACTIVE'),
  CUSTOMER_DELETED: customer('DELETED'),
  CUSTOMER_SUSPENDED: customer('SUSPENDED'),
  CUSTOMER_CREATION_FAILED: customer('FAILED'),
  ORDER_AUTHORIZED: order('AUTHORIZED'),
  ORDER_PROCESSED: order('PROCESSED'),
  ORDER_CANCELLED: order('CANCELLED'),
  PAYMENT_FAILED: order('ATTEMPTED'),
  ORDER_FAILED: order('FAILED'),
  REFUND_PROCESSED: refund('PROCESSED'),
  REFUND_FAILED: refund('FAILED'),
  TOKEN_ACTIVATED: token('ACTIVE'),
  TOKEN_DEACTIVATED: token('DEACTIVATED'),
  TOKEN_SUSPENDED: token('SUSPENDED'),
  TOKEN_PROVISION_FAILED: token('FAILED'),
  SUBSCRIPTION_ACTIVATED: subscription('ACTIVE'),
  SUBSCRIPTION_PENDING: subscription('PENDING'),
  SUBSCRIPTION_PAUSED: subscription('PAUSED'),
  SUBSCRIPTION_RESUMED: subscription('RESUMED'),
  SUBSCRIPTION_COMPLETED: subscription('COMPLETED'),
  SUBSCRIPTION_CHARGED: subscription('ACTIVE'),
  SUBSCRIPTION_HALTED: subscription('HALTED'),
  SUBSCRIPTION_CANCELLED: subscription('CANCELLED'),
  SUBSCRIPTION_REVOKE_FAILED: subscription('ACTIVE'),
  SUBSCRIPTION_UPDATED: subscription('ACTIVE'),
  SUBSCRIPTION_UPDATE_FAILED: subscription('ACTIVE'),
  ORDER_SETTLED: order('SETTLED'),
  ORDER_SETTLEMENT_REJECTED: order('SETTLEMENT_REJECTED'),
};

const body = (type: string) => JSON.stringify({ event_type: type, data: events[type] });
const payoutBody = (type: string, status: string) =>
  JSON.stringify({ eventId: 'pytw-fc18909dee5e4430bb7d9914124e8d79', data: payout(status), eventVersion: '1.0', eventSource: 'PAYOUT', eventType: type });

describe('Pine Labs webhook handler', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('valid signatures', () => {
    it.each(Object.keys(events))('accepts %s', async (type) => {
      const raw = body(type);
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(`${type}:`));
    });

    it.each(['payout-transaction-success', 'payout-transaction-failed'])('accepts %s (camelCase eventType)', async (type) => {
      const raw = payoutBody(type, type.endsWith('success') ? 'SUCCESS' : 'FAILED');
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(`${type}: payout Payout_webhook_testing_01`));
    });

    it('verifies the example from the Pine Labs docs (raw UTF-8 key "abc1234")', async () => {
      process.env.PINE_LABS_WEBHOOK_SECRET = 'abc1234';
      try {
        const res = await post('{"payload":"payload"}', {
          'content-type': 'application/json',
          'webhook-id': 'msg_2nEfCaUDn9fynC9Kz2upo1QSydl',
          'webhook-timestamp': '1728543028',
          'webhook-signature': 'v1,Ns46HrH+Nfu9dZtBUVvSLyrOD5JH0SAGlNo3M5yobfQ=',
        });
        expect(res.status).toBe(200);
      } finally {
        process.env.PINE_LABS_WEBHOOK_SECRET = SECRET;
      }
    });

    it('accepts a whsec_ secret, base64-decoding the part after the prefix', async () => {
      process.env.PINE_LABS_WEBHOOK_SECRET = 'whsec_' + Buffer.from('decoded-key-bytes').toString('base64');
      try {
        const raw = body('ORDER_PROCESSED');
        const id = 'msg_whsec';
        const ts = String(now());
        const sig = crypto.createHmac('sha256', Buffer.from('decoded-key-bytes')).update(`${id}.${ts}.${raw}`).digest('base64');
        const res = await post(raw, signedHeaders(raw, { id, timestamp: ts, signature: `v1,${sig}` }));
        expect(res.status).toBe(200);
      } finally {
        process.env.PINE_LABS_WEBHOOK_SECRET = SECRET;
      }
    });

    it('accepts a delivery signed the same way but sent with svix-* headers', async () => {
      const raw = body('ORDER_PROCESSED');
      const res = await post(raw, signedHeaders(raw, { prefix: 'svix' }));
      expect(res.status).toBe(200);
    });

    it('accepts any content type, verifying the exact bytes', async () => {
      const raw = body('ORDER_PROCESSED');
      const res = await post(raw, { ...signedHeaders(raw), 'content-type': 'text/plain' });
      expect(res.status).toBe(200);
    });

    it('accepts when one of several space-delimited signatures matches, ignoring other versions', async () => {
      const raw = body('ORDER_PROCESSED');
      const id = 'msg_multi';
      const ts = String(now());
      const good = sign(raw, id, ts);
      const signature = `v1,${Buffer.from('bogus').toString('base64')} v1a,${good.slice(3)} ${good}`;
      const res = await post(raw, signedHeaders(raw, { id, timestamp: ts, signature }));
      expect(res.status).toBe(200);
    });

    it('does not accept a signature that only appears under another version', async () => {
      const raw = body('ORDER_PROCESSED');
      const id = 'msg_v1a';
      const ts = String(now());
      const res = await post(raw, signedHeaders(raw, { id, timestamp: ts, signature: `v1a,${sign(raw, id, ts).slice(3)}` }));
      expect(res.status).toBe(400);
    });

    it('logs unhandled event types without failing', async () => {
      const raw = JSON.stringify({ event_type: 'ORDER_EXPIRED', data: {} });
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Unhandled Pine Labs event: ORDER_EXPIRED');
    });
  });

  describe('invalid requests', () => {
    it('rejects a signature from the wrong secret', async () => {
      const raw = body('ORDER_PROCESSED');
      const res = await post(raw, signedHeaders(raw, { secret: OTHER_SECRET }));
      expect(res.status).toBe(400);
    });

    it('rejects a signature made with the base64 of the secret as key', async () => {
      const raw = body('ORDER_PROCESSED');
      const id = 'msg_b64key';
      const ts = String(now());
      const key = Buffer.from(Buffer.from(SECRET).toString('base64'), 'utf8');
      const sig = crypto.createHmac('sha256', key).update(`${id}.${ts}.${raw}`).digest('base64');
      const res = await post(raw, signedHeaders(raw, { id, timestamp: ts, signature: `v1,${sig}` }));
      expect(res.status).toBe(400);
    });

    it('rejects a tampered body', async () => {
      const raw = body('ORDER_PROCESSED');
      const headers = signedHeaders(raw);
      const res = await post(raw.replace('INR', 'USD'), headers);
      expect(res.status).toBe(400);
    });

    it('rejects a body that was re-serialised (pretty-printed)', async () => {
      const raw = body('ORDER_PROCESSED');
      const headers = signedHeaders(raw);
      const res = await post(JSON.stringify(JSON.parse(raw), null, 2), headers);
      expect(res.status).toBe(400);
    });

    it.each(['0', '-5', '1.5', '01', '12abc'])('rejects timestamp %s', async (ts) => {
      const raw = body('ORDER_PROCESSED');
      const res = await post(raw, signedHeaders(raw, { timestamp: ts }));
      expect(res.status).toBe(400);
    });

    it('accepts an old timestamp by default (retries and replays keep the original)', async () => {
      const raw = body('ORDER_PROCESSED');
      const res = await post(raw, signedHeaders(raw, { timestamp: now() - 3600 }));
      expect(res.status).toBe(200);
    });

    it('rejects an old timestamp when PINE_LABS_WEBHOOK_TOLERANCE_SECONDS is set', async () => {
      process.env.PINE_LABS_WEBHOOK_TOLERANCE_SECONDS = '300';
      try {
        const raw = body('ORDER_PROCESSED');
        const res = await post(raw, signedHeaders(raw, { timestamp: now() - 3600 }));
        expect(res.status).toBe(400);
      } finally {
        delete process.env.PINE_LABS_WEBHOOK_TOLERANCE_SECONDS;
      }
    });

    it('treats a non-numeric PINE_LABS_WEBHOOK_TOLERANCE_SECONDS as 0 (check off)', async () => {
      process.env.PINE_LABS_WEBHOOK_TOLERANCE_SECONDS = 'five minutes';
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const raw = body('ORDER_PROCESSED');
        const res = await post(raw, signedHeaders(raw, { timestamp: now() - 3600 }));
        expect(res.status).toBe(200);
      } finally {
        delete process.env.PINE_LABS_WEBHOOK_TOLERANCE_SECONDS;
      }
    });

    it('rejects a malformed signature', async () => {
      const raw = body('ORDER_PROCESSED');
      const res = await post(raw, signedHeaders(raw, { signature: 'v1,not-a-real-signature' }));
      expect(res.status).toBe(400);
    });

    it.each(['webhook-id', 'webhook-timestamp', 'webhook-signature'])('rejects a missing %s header', async (name) => {
      const raw = body('ORDER_PROCESSED');
      const headers = signedHeaders(raw);
      delete headers[name];
      const res = await post(raw, headers);
      expect(res.status).toBe(400);
    });
  });

  describe('deduplication', () => {
    it('acknowledges a repeated webhook-id without reprocessing', async () => {
      const raw = body('REFUND_PROCESSED');
      const headers = signedHeaders(raw, { id: 'msg_dupe_1' });
      const first = await post(raw, headers);
      expect(await first.json()).toEqual({ received: true });
      logSpy.mockClear();
      const second = await post(raw, headers);
      expect(second.status).toBe(200);
      expect(await second.json()).toEqual({ received: true, duplicate: true });
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('configuration', () => {
    it('fails closed when the secret is not configured', async () => {
      const raw = body('ORDER_PROCESSED');
      const headers = signedHeaders(raw);
      delete process.env.PINE_LABS_WEBHOOK_SECRET;
      try {
        const res = await post(raw, headers);
        expect(res.status).toBe(500);
      } finally {
        process.env.PINE_LABS_WEBHOOK_SECRET = SECRET;
      }
    });

    it('rejects a whsec_ secret with nothing after the prefix (empty key)', async () => {
      process.env.PINE_LABS_WEBHOOK_SECRET = 'whsec_';
      try {
        const raw = body('ORDER_PROCESSED');
        const id = 'msg_empty';
        const ts = String(now());
        const sig = crypto.createHmac('sha256', Buffer.alloc(0)).update(`${id}.${ts}.${raw}`).digest('base64');
        const res = await post(raw, signedHeaders(raw, { id, timestamp: ts, signature: `v1,${sig}` }));
        expect(res.status).toBe(400);
      } finally {
        process.env.PINE_LABS_WEBHOOK_SECRET = SECRET;
      }
    });
  });
});
