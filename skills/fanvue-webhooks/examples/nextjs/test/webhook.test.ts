import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/fanvue/route';
import {
  idempotencyKey,
  parseSignatureHeader,
  verifyFanvueSignature,
} from '../lib/fanvue-signature';

// Fanvue secrets are used verbatim as the HMAC key. API subscriptions return
// `whsec_` + 64 hex characters; the prefix is part of the key (no stripping).
const SECRET = 'whsec_3b1f8a0c2d4e6f8091a2b3c4d5e6f70819a2b3c4d5e6f70819a2b3c4d5e6f708';

beforeAll(() => {
  process.env.FANVUE_WEBHOOK_SECRET = SECRET;
});

const nowSeconds = () => Math.floor(Date.now() / 1000);

function sign(payload: string, secret = SECRET, timestamp: number | string = nowSeconds()): string {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
}

/** Build X-Fanvue-Signature: t=<seconds>,v0=<hex>[,<hex>...] */
function signatureHeader(
  payload: string,
  { secrets = [SECRET], timestamp }: { secrets?: string[]; timestamp?: number } = {}
): string {
  const t = timestamp ?? nowSeconds();
  return `t=${t},v0=${secrets.map((s) => sign(payload, s, t)).join(',')}`;
}

function buildRequest(payload: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/webhooks/fanvue', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: payload,
  });
}

const followCreated = {
  id: 'f1a2b3c4-7777-4a2b-9c3d-aaaaaaaaaaaa',
  type: 'creator.follow.created',
  timestamp: '2026-06-09T08:39:33.139Z',
  data: {
    object: 'follow',
    id: null,
    created_at: '2026-06-09T08:39:33.139Z',
    follower: { uuid: 'fan-uuid', email: null, handle: 'janed', display_name: 'Jane D' },
    creator: { uuid: 'creator-uuid' },
    metadata: {},
    tracking: {
      link_url: 'https://fanvue.com/creator-handle?fvc=summer-campaign',
      metadata: { campaign: 'summer', source: 'x' },
    },
  },
};

const paymentSucceeded = {
  id: 'f1a2b3c4-1111-4a2b-9c3d-aaaaaaaaaaaa',
  type: 'creator.payment.succeeded',
  timestamp: '2026-06-09T08:39:33.139Z',
  data: {
    object: 'payment',
    id: 'FV-12345',
    status: 'succeeded',
    source: 'message',
    billing_reason: 'one_time',
    gross: 1999,
    net: 1799,
    fees: { fanvue_fee: 200, transaction_fee: 0 },
    currency: 'USD',
    purchaser: { uuid: 'fan-uuid', email: null, handle: 'janed', display_name: 'Jane D' },
    creator: { uuid: 'creator-uuid' },
    metadata: {},
  },
};

describe('parseSignatureHeader', () => {
  it('keeps the bare rotation MAC in the v0 list', () => {
    expect(parseSignatureHeader('t=1700000000,v0=old,new')).toEqual({
      timestamp: '1700000000',
      timestampCount: 1,
      macs: ['old', 'new'],
    });
  });
});

describe('verifyFanvueSignature', () => {
  const body = JSON.stringify(followCreated);

  it('accepts a valid signature', () => {
    expect(verifyFanvueSignature(body, signatureHeader(body), SECRET)).toEqual({ valid: true });
  });

  it('uses the whsec_ secret verbatim (a stripped prefix does not verify)', () => {
    const header = signatureHeader(body, { secrets: [SECRET.slice('whsec_'.length)] });
    expect(verifyFanvueSignature(body, header, SECRET).valid).toBe(false);
  });

  it('accepts when only the second (rotation) MAC matches', () => {
    const header = signatureHeader(body, { secrets: ['old_secret', SECRET] });
    expect(verifyFanvueSignature(body, header, SECRET)).toEqual({ valid: true });
  });

  it('accepts uppercase hex, as the Hookdeck FANVUE verifier does', () => {
    const t = nowSeconds();
    const header = `t=${t},v0=${sign(body, SECRET, t).toUpperCase()}`;
    expect(verifyFanvueSignature(body, header, SECRET, undefined, t)).toEqual({ valid: true });
  });

  it('rejects missing, repeated or non-decimal t and a missing MAC', () => {
    const t = nowSeconds();
    for (const header of [
      `v0=${sign(body)}`,
      `t=${t},t=${t},v0=${sign(body, SECRET, t)}`,
      `t=1e9,v0=${sign(body, SECRET, '1e9')}`,
      `t=${t}`,
    ]) {
      expect(verifyFanvueSignature(body, header, SECRET)).toMatchObject({
        valid: false,
        error: expect.stringContaining('Malformed'),
      });
    }
  });

  it('rejects stale and future timestamps beyond 300 seconds', () => {
    for (const t of [nowSeconds() - 301, nowSeconds() + 301]) {
      expect(verifyFanvueSignature(body, signatureHeader(body, { timestamp: t }), SECRET)).toMatchObject({
        valid: false,
        error: expect.stringContaining('Timestamp'),
      });
    }
  });
});

describe('idempotencyKey', () => {
  it('uses id for envelope events and keeps it alone for creator.subscription.*', () => {
    expect(idempotencyKey(paymentSucceeded)).toBe(paymentSucceeded.id);
    expect(idempotencyKey({ id: 'a', type: 'creator.subscription.renewed', timestamp: 't', data: { object: 'subscription' } })).toBe('a');
  });

  it('pairs id with timestamp for app.subscription.*', () => {
    expect(
      idempotencyKey({ id: 'a', type: 'app.subscription.activated', timestamp: 't1', data: { object: 'subscription' } })
    ).toBe('a:t1');
  });

  it('uses eventId for legacy events and pairs it with timestamp for legacy message.read', () => {
    expect(idempotencyKey({ recipientUuid: 'r', eventId: 'e1', timestamp: 't' })).toBe('e1');
    expect(idempotencyKey({ readMessagesCount: 5, recipientUuid: 'r', eventId: 'e1', timestamp: 't1' })).toBe('e1:t1');
  });
});

describe('POST /webhooks/fanvue', () => {
  it('answers the unsigned verification probe with 200', async () => {
    const res = await POST(
      buildRequest(JSON.stringify({ type: 'fanvue.webhook.verification', timestamp: '2026-06-09T08:39:33.139Z' }))
    );
    expect(res.status).toBe(200);
  });

  it('returns 401 for any other unsigned request', async () => {
    const res = await POST(buildRequest(JSON.stringify(followCreated)));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toContain('Missing X-Fanvue-Signature');
  });

  it('returns 401 for unsigned non-JSON bodies', async () => {
    const res = await POST(buildRequest('not json'));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a tampered payload', async () => {
    const original = JSON.stringify(paymentSucceeded);
    const tampered = JSON.stringify({ ...paymentSucceeded, data: { ...paymentSucceeded.data, gross: 1 } });
    const res = await POST(buildRequest(tampered, { 'x-fanvue-signature': signatureHeader(original) }));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a re-serialised body (verify the raw bytes)', async () => {
    const raw = JSON.stringify(followCreated, null, 2);
    const reserialised = JSON.stringify(JSON.parse(raw));
    const res = await POST(buildRequest(reserialised, { 'x-fanvue-signature': signatureHeader(raw) }));
    expect(res.status).toBe(401);
  });

  it('returns 200 for a valid signature', async () => {
    const payload = JSON.stringify(paymentSucceeded);
    const res = await POST(buildRequest(payload, { 'x-fanvue-signature': signatureHeader(payload) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('returns 200 when the newer secret signs the second MAC during rotation', async () => {
    const payload = JSON.stringify(followCreated);
    const header = signatureHeader(payload, { secrets: ['previous_secret', SECRET] });
    const res = await POST(buildRequest(payload, { 'x-fanvue-signature': header }));
    expect(res.status).toBe(200);
  });

  it('accepts a signed legacy flat event', async () => {
    const payload = JSON.stringify({
      recipientUuid: 'f4b2a184-2b4a-4a04-9b70-3c0e0a1caa12',
      sender: { displayName: 'Test User', handle: 'test-user', uuid: '5939ae62-3eb5-4433-954f-f78c7b4282f3' },
      trackingLinkId: 'spring-promo',
      timestamp: '2025-11-06T10:32:49.880Z',
    });
    const res = await POST(buildRequest(payload, { 'x-fanvue-signature': signatureHeader(payload) }));
    expect(res.status).toBe(200);
  });

  it('handles every live event type and answers 2xx for unknown types', async () => {
    const eventTypes = [
      'creator.payment.succeeded',
      'creator.reward.created',
      'creator.reward.reversed',
      'creator.subscription.activated',
      'creator.subscription.renewed',
      'creator.subscription.deactivated',
      'creator.subscription.cancel_at_period_end_changed',
      'creator.experience_subscription.activated',
      'creator.experience_subscription.deactivated',
      'creator.message.received',
      'creator.message.sent',
      'creator.message.mass_sent',
      'creator.message.read',
      'creator.message.read_by_fan',
      'creator.message.deleted',
      'creator.message.reaction',
      'creator.chat.marked_unread',
      'creator.follow.created',
      'creator.post.liked',
      'creator.post.commented',
      'creator.refund.created',
      'creator.dispute.flagged',
      'creator.dispute.created',
      'creator.fan.status_changed',
      'creator.fan.presence_changed',
      'checkout_link.payment.pending',
      'checkout_link.payment.succeeded',
      'checkout_link.payment.failed',
      'checkout_link.subscription.activated',
      'checkout_link.subscription.deactivated',
      'checkout_link.subscription.cancel_at_period_end_changed',
      'checkout_link.refund.created',
      'checkout_link.refund.requested',
      'checkout_link.dispute.flagged',
      'checkout_link.dispute.created',
      'checkout_link.installment.paid',
      'checkout_link.installment.failed',
      'checkout_link.plan.completed',
      'payout.paid',
      'payout.failed',
      'app.payment.pending',
      'app.payment.succeeded',
      'app.payment.failed',
      'app.subscription.activated',
      'app.subscription.cancel_at_period_end_changed',
      'app.refund.created',
      'app.payment.refunded',
      'app.dispute.flagged',
      'app.dispute.created',
      'app.experience.action.payment.pending',
      'app.experience.action.payment.succeeded',
      'app.experience.action.payment.failed',
      'app.experience.action.refund.created',
      'app.experience.action.dispute.flagged',
      'app.experience.action.dispute.created',
      'unknown.future.event',
    ];

    for (const type of eventTypes) {
      const payload = JSON.stringify({
        id: `evt-${type}`,
        type,
        timestamp: new Date().toISOString(),
        data: { object: 'test', id: 'TEST-1' },
      });
      const res = await POST(buildRequest(payload, { 'x-fanvue-signature': signatureHeader(payload) }));
      expect(res.status).toBe(200);
    }
  });
});
