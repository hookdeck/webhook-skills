import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { POST } from '../app/webhooks/dodo-payments/route';

// Standard Webhooks secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';
const OTHER_SECRET = 'whsec_b3RoZXJfc2VjcmV0X2tleQ==';

// Standard Webhooks algorithm: base64(HMAC-SHA256(decoded secret, `${id}.${timestamp}.${body}`))
function sign(payload: string, msgId: string, timestamp: string, secret = TEST_SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${signature}`;
}

const now = () => Math.floor(Date.now() / 1000).toString();

function send(
  payload: string,
  opts: {
    msgId?: string;
    timestamp?: string;
    signature?: string;
    headers?: Record<string, string>;
    contentType?: string;
    prefix?: 'svix' | 'webhook';
  } = {}
) {
  const msgId = opts.msgId ?? `msg_${crypto.randomBytes(12).toString('hex')}`;
  const timestamp = opts.timestamp ?? now();
  const prefix = opts.prefix ?? 'webhook';
  const headers: Record<string, string> = opts.headers ?? {
    [`${prefix}-id`]: msgId,
    [`${prefix}-timestamp`]: timestamp,
    [`${prefix}-signature`]: opts.signature ?? sign(payload, msgId, timestamp),
  };
  return POST(
    new Request('http://localhost:3000/webhooks/dodo-payments', {
      method: 'POST',
      headers: { 'content-type': opts.contentType ?? 'application/json', ...headers },
      body: payload,
    })
  );
}

function envelope(type: string, payloadType: string, data: Record<string, unknown> = {}) {
  return JSON.stringify({
    business_id: 'bus_H4ekzPSlcg',
    type,
    timestamp: '2024-01-15T10:30:00Z',
    data: { payload_type: payloadType, ...data },
  });
}

const events: [string, string][] = [
  ['payment.succeeded', 'Payment'],
  ['payment.failed', 'Payment'],
  ['payment.processing', 'Payment'],
  ['payment.cancelled', 'Payment'],
  ['refund.succeeded', 'Refund'],
  ['refund.failed', 'Refund'],
  ['dispute.opened', 'Dispute'],
  ['dispute.won', 'Dispute'],
  ['dispute.lost', 'Dispute'],
  ['subscription.active', 'Subscription'],
  ['subscription.renewed', 'Subscription'],
  ['subscription.on_hold', 'Subscription'],
  ['subscription.cancelled', 'Subscription'],
  ['license_key.created', 'LicenseKey'],
];

describe('Dodo Payments webhook handler', () => {
  beforeEach(() => {
    process.env.DODO_PAYMENTS_WEBHOOK_SECRET = TEST_SECRET;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test.each(events)('handles %s', async (type, payloadType) => {
    const res = await send(envelope(type, payloadType));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, type });
  });

  test('acknowledges an event type it does not handle', async () => {
    const res = await send(envelope('payout.success', 'Payout'));
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('payout.success');
  });

  test('accepts a delivery signed the same way but sent with svix-* headers', async () => {
    const res = await send(envelope('payment.succeeded', 'Payment'), { prefix: 'svix' });
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('payment.succeeded');
  });

  test('prefers the webhook-* headers when both sets are present', async () => {
    const payload = envelope('payment.succeeded', 'Payment');
    const timestamp = now();
    const res = await send(payload, {
      headers: {
        'webhook-id': 'msg_both',
        'webhook-timestamp': timestamp,
        'webhook-signature': sign(payload, 'msg_both', timestamp),
        'svix-id': 'msg_other',
        'svix-timestamp': timestamp,
        'svix-signature': 'v1,AAAA',
      },
    });
    expect(res.status).toBe(200);
  });

  test('verifies the raw bytes whatever the content type', async () => {
    const res = await send(envelope('payment.succeeded', 'Payment'), { contentType: 'text/plain' });
    expect(res.status).toBe(200);
  });

  test('verifies the exact raw bytes, including odd whitespace', async () => {
    const payload =
      '{ "business_id" : "bus_1",\n "type":"payment.succeeded", "timestamp":"2024-01-15T10:30:00Z", "data":{"payload_type":"Payment"} }';
    const res = await send(payload);
    expect(res.status).toBe(200);
  });

  test('accepts any matching v1 entry and ignores other versions', async () => {
    const payload = envelope('subscription.active', 'Subscription');
    const msgId = 'msg_multi';
    const timestamp = now();
    const good = sign(payload, msgId, timestamp);
    const bad = sign(payload, msgId, timestamp, OTHER_SECRET);
    const res = await send(payload, { msgId, timestamp, signature: `v1a,ignored ${bad} ${good}` });
    expect(res.status).toBe(200);
  });

  test('rejects a missing signature header', async () => {
    const res = await send(envelope('payment.succeeded', 'Payment'), {
      headers: { 'webhook-id': 'msg_1', 'webhook-timestamp': now() },
    });
    expect(res.status).toBe(400);
  });

  test('rejects a request with no webhook headers', async () => {
    const res = await send(envelope('payment.succeeded', 'Payment'), { headers: {} });
    expect(res.status).toBe(400);
  });

  test('rejects an invalid signature', async () => {
    const res = await send(envelope('payment.succeeded', 'Payment'), { signature: 'v1,aW52YWxpZA==' });
    expect(res.status).toBe(401);
  });

  test('rejects a signature made with another secret', async () => {
    const payload = envelope('payment.succeeded', 'Payment');
    const msgId = 'msg_other_secret';
    const timestamp = now();
    const res = await send(payload, { msgId, timestamp, signature: sign(payload, msgId, timestamp, OTHER_SECRET) });
    expect(res.status).toBe(401);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign(envelope('payment.succeeded', 'Payment'), msgId, timestamp);
    const res = await send(envelope('payment.failed', 'Payment'), { msgId, timestamp, signature });
    expect(res.status).toBe(401);
  });

  test('rejects a stale timestamp (library window is 5 minutes)', async () => {
    const payload = envelope('payment.succeeded', 'Payment');
    const msgId = 'msg_stale';
    const timestamp = (Math.floor(Date.now() / 1000) - 600).toString();
    const res = await send(payload, { msgId, timestamp });
    expect(res.status).toBe(401);
  });

  test('returns 400 for a verified body that is not JSON', async () => {
    const res = await send('not json');
    expect(res.status).toBe(400);
  });

  test('fails closed when the secret is not configured', async () => {
    delete process.env.DODO_PAYMENTS_WEBHOOK_SECRET;
    const res = await send(envelope('payment.succeeded', 'Payment'));
    expect(res.status).toBe(500);
  });

  test('fails closed when the secret is not a whsec_ secret', async () => {
    process.env.DODO_PAYMENTS_WEBHOOK_SECRET = 'not-a-whsec-secret';
    const res = await send(envelope('payment.succeeded', 'Payment'));
    expect(res.status).toBe(500);
  });
});
