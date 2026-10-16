const request = require('supertest');
const crypto = require('crypto');

// Fanvue secrets are used verbatim as the HMAC key. API subscriptions return
// `whsec_` + 64 hex characters; the prefix is part of the key (no stripping).
const SECRET = 'whsec_3b1f8a0c2d4e6f8091a2b3c4d5e6f70819a2b3c4d5e6f70819a2b3c4d5e6f708';
process.env.FANVUE_WEBHOOK_SECRET = SECRET;

const app = require('../src/index');
const { verifyFanvueSignature, parseSignatureHeader, idempotencyKey } = app;

function sign(payload, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
}

/** Build X-Fanvue-Signature: t=<seconds>,v0=<hex>[,<hex>...] */
function signatureHeader(payload, { secrets = [SECRET], timestamp } = {}) {
  const t = timestamp ?? Math.floor(Date.now() / 1000);
  const macs = secrets.map((s) => sign(payload, s, t));
  return `t=${t},v0=${macs.join(',')}`;
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
    paid_in_full: true,
    message_uuid: '2f7c5e8a-6d36-4e3a-98d9-9f1b3b0a1a10',
    purchaser: { uuid: 'fan-uuid', email: null, handle: 'janed', display_name: 'Jane D' },
    creator: { uuid: 'creator-uuid' },
    metadata: {},
  },
};

function post(payload, header) {
  const req = request(app).post('/webhooks/fanvue').set('Content-Type', 'application/json');
  if (header) req.set('X-Fanvue-Signature', header);
  return req.send(payload);
}

describe('parseSignatureHeader', () => {
  it('parses a single MAC', () => {
    expect(parseSignatureHeader('t=1700000000,v0=abc')).toEqual({
      timestamp: '1700000000',
      timestampCount: 1,
      macs: ['abc'],
    });
  });

  it('keeps the bare rotation MAC in the v0 list', () => {
    expect(parseSignatureHeader('t=1700000000,v0=old,new').macs).toEqual(['old', 'new']);
  });
});

describe('verifyFanvueSignature', () => {
  const body = JSON.stringify(followCreated);

  it('accepts a valid signature', () => {
    expect(verifyFanvueSignature(Buffer.from(body), signatureHeader(body), SECRET)).toEqual({ valid: true });
  });

  it('uses the whsec_ secret verbatim (a stripped prefix does not verify)', () => {
    const header = signatureHeader(body, { secrets: [SECRET.slice('whsec_'.length)] });
    expect(verifyFanvueSignature(Buffer.from(body), header, SECRET).valid).toBe(false);
  });

  it('accepts when only the second (rotation) MAC matches', () => {
    const header = signatureHeader(body, { secrets: ['old_secret', SECRET] });
    expect(verifyFanvueSignature(Buffer.from(body), header, SECRET)).toEqual({ valid: true });
  });

  it('accepts uppercase hex, as the Hookdeck FANVUE verifier does', () => {
    const t = Math.floor(Date.now() / 1000);
    const header = `t=${t},v0=${sign(body, SECRET, t).toUpperCase()}`;
    expect(verifyFanvueSignature(Buffer.from(body), header, SECRET)).toEqual({ valid: true });
  });

  it('rejects a missing t', () => {
    expect(verifyFanvueSignature(Buffer.from(body), `v0=${sign(body)}`, SECRET).error).toMatch(/Malformed/);
  });

  it('rejects a repeated t', () => {
    const t = Math.floor(Date.now() / 1000);
    const header = `t=${t},t=${t},v0=${sign(body, SECRET, t)}`;
    expect(verifyFanvueSignature(Buffer.from(body), header, SECRET).error).toMatch(/Malformed/);
  });

  it('rejects a non-decimal t', () => {
    const header = `t=1e9,v0=${sign(body, SECRET, '1e9')}`;
    expect(verifyFanvueSignature(Buffer.from(body), header, SECRET).error).toMatch(/Malformed/);
  });

  it('rejects a header with no MAC', () => {
    expect(verifyFanvueSignature(Buffer.from(body), `t=${Math.floor(Date.now() / 1000)}`, SECRET).error).toMatch(/Malformed/);
  });

  it('rejects stale and future timestamps beyond 300 seconds', () => {
    const now = Math.floor(Date.now() / 1000);
    for (const t of [now - 301, now + 301]) {
      const header = signatureHeader(body, { timestamp: t });
      expect(verifyFanvueSignature(Buffer.from(body), header, SECRET).error).toMatch(/Timestamp/);
    }
  });
});

describe('idempotencyKey', () => {
  it('uses id for envelope events', () => {
    expect(idempotencyKey(paymentSucceeded)).toBe(paymentSucceeded.id);
  });

  it('keeps id alone for creator.subscription.* and creator.message.read', () => {
    expect(idempotencyKey({ id: 'a', type: 'creator.subscription.renewed', timestamp: 't', data: {} })).toBe('a');
    expect(idempotencyKey({ id: 'b', type: 'creator.message.read', timestamp: 't', data: {} })).toBe('b');
  });

  it('pairs id with timestamp for app.subscription.*', () => {
    expect(
      idempotencyKey({ id: 'a', type: 'app.subscription.cancel_at_period_end_changed', timestamp: 't1', data: {} })
    ).toBe('a:t1');
  });

  it('uses eventId for legacy events', () => {
    expect(idempotencyKey({ recipientUuid: 'r', eventId: 'e1', timestamp: 't' })).toBe('e1');
  });

  it('pairs eventId with timestamp for legacy message.read', () => {
    expect(
      idempotencyKey({ counterpartUuid: 'c', readMessagesCount: 5, recipientUuid: 'r', eventId: 'e1', timestamp: 't1' })
    ).toBe('e1:t1');
  });
});

describe('POST /webhooks/fanvue', () => {
  it('answers the unsigned verification probe with 200', async () => {
    const res = await post(
      JSON.stringify({ type: 'fanvue.webhook.verification', timestamp: '2026-06-09T08:39:33.139Z' })
    );
    expect(res.status).toBe(200);
  });

  it('returns 401 for any other unsigned request', async () => {
    const res = await post(JSON.stringify(followCreated));
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Missing X-Fanvue-Signature');
  });

  it('returns 401 for unsigned non-JSON bodies', async () => {
    const res = await post('not json');
    expect(res.status).toBe(401);
  });

  it('returns 401 for an invalid signature', async () => {
    const t = Math.floor(Date.now() / 1000);
    const res = await post(JSON.stringify(followCreated), `t=${t},v0=${'0'.repeat(64)}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid signature');
  });

  it('returns 401 for a tampered payload', async () => {
    const original = JSON.stringify(paymentSucceeded);
    const tampered = JSON.stringify({ ...paymentSucceeded, data: { ...paymentSucceeded.data, gross: 1 } });
    const res = await post(tampered, signatureHeader(original));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a re-serialised body (verify the raw bytes)', async () => {
    const raw = JSON.stringify(followCreated, null, 2);
    const reserialised = JSON.stringify(JSON.parse(raw));
    const res = await post(reserialised, signatureHeader(raw));
    expect(res.status).toBe(401);
  });

  it('returns 401 for an expired timestamp', async () => {
    const payload = JSON.stringify(followCreated);
    const res = await post(payload, signatureHeader(payload, { timestamp: Math.floor(Date.now() / 1000) - 600 }));
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Timestamp');
  });

  it('returns 200 for a valid signature', async () => {
    const payload = JSON.stringify(paymentSucceeded);
    const res = await post(payload, signatureHeader(payload));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('returns 200 when the newer secret signs the second MAC during rotation', async () => {
    const payload = JSON.stringify(followCreated);
    const res = await post(payload, signatureHeader(payload, { secrets: ['previous_secret', SECRET] }));
    expect(res.status).toBe(200);
  });

  it('routes on the signed body, not the X-Fanvue-Topic header', async () => {
    const payload = JSON.stringify(followCreated);
    const res = await request(app)
      .post('/webhooks/fanvue')
      .set('Content-Type', 'application/json')
      .set('X-Fanvue-Topic', 'creator.payment.succeeded')
      .set('X-Fanvue-Signature', signatureHeader(payload))
      .send(payload);
    expect(res.status).toBe(200);
  });

  it('accepts a signed legacy flat event', async () => {
    const payload = JSON.stringify({
      recipientUuid: 'f4b2a184-2b4a-4a04-9b70-3c0e0a1caa12',
      sender: {
        avatarUrl: 'https://via.placeholder.com/150',
        displayName: 'Test User',
        handle: 'test-user',
        uuid: '5939ae62-3eb5-4433-954f-f78c7b4282f3',
      },
      trackingLinkId: 'spring-promo',
      trackingLinkUrl: 'spring-promo',
      trackingLinkMetadata: { source: 'instagram' },
      timestamp: '2025-11-06T10:32:49.880Z',
    });
    const res = await post(payload, signatureHeader(payload));
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
      const res = await post(payload, signatureHeader(payload));
      expect(res.status).toBe(200);
    }
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
