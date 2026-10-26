// Generated with: blindpay-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/blindpay/route';

// Svix secrets are "whsec_" + base64(key bytes). The HMAC key is the
// base64-DECODED part after "whsec_".
const SECRET = 'whsec_' + Buffer.from('blindpay-test-signing-key-012345').toString('base64');
const OTHER_SECRET = 'whsec_' + Buffer.from('some-other-webhook-signing-key00').toString('base64');

const EVENTS = [
  'customer.new', 'customer.update', 'customer.delete', 'bankAccount.new',
  'blockchainWallet.new', 'blockchainWallet.update', 'tos.accept',
  'payin.new', 'payin.update', 'payin.complete',
  'payout.new', 'payout.update', 'payout.complete',
  'virtualAccount.new', 'virtualAccount.complete',
  'transfer.new', 'transfer.update', 'transfer.complete',
  'wallet.new', 'wallet.update', 'wallet.inbound',
  'limitIncrease.new', 'limitIncrease.update',
  'payable.new', 'payable.update', 'payable.complete',
];

/** Sign exactly like Svix / BlindPay. */
function sign(rawBody: string, id: string, timestamp: string, secret = SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);

interface SignOptions {
  id?: string;
  timestamp?: number | string;
  secret?: string;
  signature?: string;
  contentType?: string;
}

function signedHeaders(rawBody: string, opts: SignOptions = {}): Record<string, string> {
  const id = opts.id || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(opts.timestamp ?? now());
  return {
    'Content-Type': opts.contentType ?? 'application/json',
    'svix-id': id,
    'svix-timestamp': ts,
    'svix-signature': opts.signature ?? sign(rawBody, id, ts, opts.secret),
  };
}

async function post(rawBody: string, headers: Record<string, string>) {
  const res = await POST(
    new Request('http://localhost:3000/webhooks/blindpay', { method: 'POST', headers, body: rawBody })
  );
  return { status: res.status, body: await res.json() };
}

function event(webhookEvent: string, extra: Record<string, unknown> = {}) {
  return {
    webhook_event: webhookEvent,
    id: 'pi_000000000000',
    status: 'processing',
    customer_id: 'cu_000000000000',
    ...extra,
  };
}

describe('BlindPay webhook handler', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.BLINDPAY_WEBHOOK_SECRET = SECRET;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('valid signatures', () => {
    it.each(EVENTS)('accepts %s', async (name) => {
      const raw = JSON.stringify(event(name));
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
      expect(logSpy.mock.calls.flat().join('\n')).not.toContain('Unhandled BlindPay event type');
    });

    it('logs unknown events as unhandled but still acknowledges them', async () => {
      const raw = JSON.stringify(event('thing.new'));
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Unhandled BlindPay event type: thing.new');
    });

    it('accepts any content type', async () => {
      const raw = JSON.stringify(event('payin.complete'));
      const res = await post(raw, signedHeaders(raw, { contentType: 'application/vnd.api+json' }));
      expect(res.status).toBe(200);
    });

    it('accepts a body with significant whitespace (raw bytes are verified)', async () => {
      const raw = `{ "webhook_event" : "payin.complete",\n  "id": "pi_1" }`;
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
    });

    it('accepts when any of several signatures matches', async () => {
      const raw = JSON.stringify(event('payout.complete'));
      const id = 'msg_multi';
      const ts = String(now());
      const signature = `v1,${Buffer.from('bogus').toString('base64')} ${sign(raw, id, ts)}`;
      const res = await post(raw, signedHeaders(raw, { id, timestamp: ts, signature }));
      expect(res.status).toBe(200);
    });
  });

  describe('invalid requests', () => {
    it('rejects a tampered body', async () => {
      const raw = JSON.stringify(event('payin.complete'));
      const headers = signedHeaders(raw);
      const res = await post(raw.replace('pi_000000000000', 'pi_999999999999'), headers);
      expect(res.status).toBe(400);
    });

    it('rejects a signature made with another secret', async () => {
      const raw = JSON.stringify(event('payin.complete'));
      const res = await post(raw, signedHeaders(raw, { secret: OTHER_SECRET }));
      expect(res.status).toBe(400);
    });

    it('rejects a timestamp older than 5 minutes', async () => {
      const raw = JSON.stringify(event('payin.complete'));
      const res = await post(raw, signedHeaders(raw, { timestamp: now() - 600 }));
      expect(res.status).toBe(400);
    });

    it('rejects a timestamp too far in the future', async () => {
      const raw = JSON.stringify(event('payin.complete'));
      const res = await post(raw, signedHeaders(raw, { timestamp: now() + 600 }));
      expect(res.status).toBe(400);
    });

    it.each(['svix-id', 'svix-timestamp', 'svix-signature'])('rejects a missing %s header', async (name) => {
      const raw = JSON.stringify(event('payin.complete'));
      const headers = signedHeaders(raw);
      delete headers[name];
      const res = await post(raw, headers);
      expect(res.status).toBe(400);
    });
  });

  describe('deduplication', () => {
    it('acknowledges a retry with the same svix-id without reprocessing', async () => {
      const raw = JSON.stringify(event('payin.complete'));
      const headers = signedHeaders(raw);
      const first = await post(raw, headers);
      expect(first.body).toEqual({ received: true });
      const second = await post(raw, headers);
      expect(second.status).toBe(200);
      expect(second.body).toEqual({ received: true, duplicate: true });
    });
  });

  describe('configuration', () => {
    it('fails closed when the secret is not configured', async () => {
      delete process.env.BLINDPAY_WEBHOOK_SECRET;
      const raw = JSON.stringify(event('payin.complete'));
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(500);
    });
  });
});
