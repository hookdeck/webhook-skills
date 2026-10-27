import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { POST } from '../app/webhooks/justt/route';

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
    new Request('http://localhost:3000/webhooks/justt', {
      method: 'POST',
      headers: { 'content-type': opts.contentType ?? 'application/json', ...headers },
      body: payload,
    })
  );
}

function envelope(type: string, data: Record<string, unknown> = { chargebackId: 'QRZ54SXB4K6TF232' }) {
  return JSON.stringify({ type, timestamp: '2022-03-15T09:39:24.514Z', data });
}

const events = [
  'chargeback.created',
  'chargeback.updated',
  'chargeback.status.updated',
  'chargeback.evidence.submitted',
  'chargeback.accepted',
  'pre_chargeback_alert.received',
  'pre_chargeback_alert.refund.succeeded',
  'pre_chargeback_alert.refund.failed',
  'pre_chargeback_alert.transaction_matched',
  'subscription.cancel_immediately.success',
  'subscription.cancel_immediately.failed',
];

describe('Justt webhook handler', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.JUSTT_WEBHOOK_SECRET = TEST_SECRET;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test.each(events)('handles %s', async (type) => {
    const res = await send(envelope(type));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, type });
  });

  test('logs the documented data fields', async () => {
    await send(envelope('subscription.cancel_immediately.failed', { subscriptionId: 'sub_1', failureCode: 'subscription_not_found' }));
    await send(envelope('pre_chargeback_alert.received', { internalAlertId: 'alert_1' }));
    expect(logSpy).toHaveBeenCalledWith('Subscription cancel failed:', 'sub_1', 'subscription_not_found');
    expect(logSpy).toHaveBeenCalledWith('Pre-chargeback alert received:', 'alert_1');
  });

  test('acknowledges an event type it does not handle', async () => {
    const res = await send(envelope('ping'));
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('ping');
  });

  test('accepts a delivery signed the same way but sent with svix-* headers', async () => {
    const res = await send(envelope('chargeback.created'), { prefix: 'svix' });
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('chargeback.created');
  });

  test('prefers the webhook-* headers when both sets are present', async () => {
    const payload = envelope('chargeback.created');
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
    const res = await send(envelope('chargeback.created'), { contentType: 'text/plain' });
    expect(res.status).toBe(200);
  });

  test('verifies the exact raw bytes, including odd whitespace', async () => {
    const payload =
      '{ "type":"chargeback.created", "timestamp":"2024-01-15T10:30:00Z", "data":{"chargebackId":"CB_1"} }';
    const res = await send(payload);
    expect(res.status).toBe(200);
  });

  test('accepts any matching v1 entry and ignores other versions', async () => {
    const payload = envelope('chargeback.status.updated');
    const msgId = 'msg_multi';
    const timestamp = now();
    const good = sign(payload, msgId, timestamp);
    const bad = sign(payload, msgId, timestamp, OTHER_SECRET);
    const res = await send(payload, { msgId, timestamp, signature: `v1a,ignored ${bad} ${good}` });
    expect(res.status).toBe(200);
  });

  test('rejects a missing signature header', async () => {
    const res = await send(envelope('chargeback.created'), {
      headers: { 'webhook-id': 'msg_1', 'webhook-timestamp': now() },
    });
    expect(res.status).toBe(400);
  });

  test('rejects a request with no webhook headers', async () => {
    const res = await send(envelope('chargeback.created'), { headers: {} });
    expect(res.status).toBe(400);
  });

  test('rejects an invalid signature', async () => {
    const res = await send(envelope('chargeback.created'), { signature: 'v1,aW52YWxpZA==' });
    expect(res.status).toBe(401);
  });

  test('rejects a signature made with another secret', async () => {
    const payload = envelope('chargeback.created');
    const msgId = 'msg_other_secret';
    const timestamp = now();
    const res = await send(payload, { msgId, timestamp, signature: sign(payload, msgId, timestamp, OTHER_SECRET) });
    expect(res.status).toBe(401);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign(envelope('chargeback.created'), msgId, timestamp);
    const res = await send(envelope('chargeback.updated'), { msgId, timestamp, signature });
    expect(res.status).toBe(401);
  });

  test('rejects a stale timestamp (library window is 5 minutes)', async () => {
    const payload = envelope('chargeback.created');
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
    delete process.env.JUSTT_WEBHOOK_SECRET;
    const res = await send(envelope('chargeback.created'));
    expect(res.status).toBe(500);
  });

  test('fails closed when the secret is not a whsec_ secret', async () => {
    process.env.JUSTT_WEBHOOK_SECRET = 'not-a-whsec-secret';
    const res = await send(envelope('chargeback.created'));
    expect(res.status).toBe(500);
  });
});
