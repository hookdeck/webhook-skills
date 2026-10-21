import { describe, test, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/wetravel/route';

// Svix-style secret: 'whsec_' + base64(key). base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

const EVENT_TYPES = [
  'booking.created',
  'booking.updated',
  'payment.created',
  'payment.updated',
  'transaction.created',
  'transaction.updated',
  'trip.published',
  'lead.created',
  'lead.updated',
];

// Sign the way Svix does:
// base64(HMAC_SHA256(base64Decode(secret after whsec_), `${id}.${timestamp}.${payload}`))
function sign(payload: string, timestamp: string, msgId: string, secret = TEST_SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000).toString();
const body = (type: string) => JSON.stringify({ type, data: { id: 12345 } });

function post(payload: string, headers: Record<string, string>) {
  return POST(
    new Request('http://localhost:3000/webhooks/wetravel', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: payload,
    })
  );
}

function signed(payload: string, prefix = 'svix', timestamp = now(), signature?: string) {
  const msgId = 'msg_' + crypto.randomBytes(12).toString('hex');
  return post(payload, {
    [`${prefix}-id`]: msgId,
    [`${prefix}-timestamp`]: timestamp,
    [`${prefix}-signature`]: signature ?? sign(payload, timestamp, msgId),
  });
}

describe('WeTravel Webhook Handler', () => {
  beforeAll(() => {
    process.env.WETRAVEL_WEBHOOK_SECRET = TEST_SECRET;
  });

  test('accepts a valid svix-* signed webhook', async () => {
    const res = await signed(body('booking.created'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, type: 'booking.created' });
  });

  test('accepts webhook-* header aliases', async () => {
    const res = await signed(body('payment.created'), 'webhook');
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('payment.created');
  });

  test('accepts when any one of multiple signatures matches (secret rotation)', async () => {
    const payload = body('booking.updated');
    const ts = now();
    const res = await post(payload, {
      'svix-id': 'msg_rotation',
      'svix-timestamp': ts,
      'svix-signature': `v1,aW52YWxpZF9zaWduYXR1cmU= ${sign(payload, ts, 'msg_rotation')}`,
    });
    expect(res.status).toBe(200);
  });

  test('rejects missing headers', async () => {
    const res = await post(body('booking.created'), {});
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Missing required webhook headers');
  });

  test('rejects an invalid signature', async () => {
    const res = await signed(body('booking.created'), 'svix', now(), 'v1,aW52YWxpZF9zaWduYXR1cmU=');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a tampered body', async () => {
    const ts = now();
    const res = await post(body('booking.updated'), {
      'svix-id': 'msg_t',
      'svix-timestamp': ts,
      'svix-signature': sign(body('booking.created'), ts, 'msg_t'),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects an old timestamp', async () => {
    const old = (Math.floor(Date.now() / 1000) - 600).toString();
    const res = await signed(body('booking.created'), 'svix', old);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Timestamp too old');
  });

  test.each(EVENT_TYPES)('handles %s', async (type) => {
    const res = await signed(body(type));
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe(type);
  });

  test('acknowledges unknown event types', async () => {
    const res = await signed(body('something.new'));
    expect(res.status).toBe(200);
  });

  test('returns 500 when the secret is not configured', async () => {
    const saved = process.env.WETRAVEL_WEBHOOK_SECRET;
    delete process.env.WETRAVEL_WEBHOOK_SECRET;
    const res = await signed(body('booking.created'));
    process.env.WETRAVEL_WEBHOOK_SECRET = saved;
    expect(res.status).toBe(500);
  });
});
