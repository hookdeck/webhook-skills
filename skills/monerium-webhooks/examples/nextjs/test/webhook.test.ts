import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { POST } from '../app/webhooks/monerium/route';

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
    new Request('http://localhost:3000/webhooks/monerium', {
      method: 'POST',
      headers: { 'content-type': opts.contentType ?? 'application/json', ...headers },
      body: payload,
    })
  );
}

function envelope(type: string, data: Record<string, unknown> = {}) {
  return JSON.stringify({ type, data: { id: 'order-id', ...data } });
}

// Event names as listed at https://docs.monerium.com/private; data fields (id, state, meta, kind, amount,
// currency, chain, counterpart) are the ones its handler examples read, as no payload example is printed
const events: [string, Record<string, unknown>][] = [
  ['order.created', { kind: 'issue', amount: '100.00', currency: 'eur', chain: 'gnosis', counterpart: { identifier: { standard: 'iban', iban: 'EE521273842688571285' } } }],
  ['order.updated', { state: 'placed', meta: {} }],
  ['subscription.created', {}],
];

describe('Monerium webhook handler', () => {
  beforeEach(() => {
    process.env.MONERIUM_WEBHOOK_SECRET = TEST_SECRET;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test.each(events)('handles %s', async (type, data) => {
    const res = await send(envelope(type, data));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, type });
  });

  test('handles a processed order with transaction hashes', async () => {
    const res = await send(envelope('order.updated', { state: 'processed', meta: { txHashes: ['0xabc'] } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, type: 'order.updated' });
  });

  test('handles a rejected order', async () => {
    const res = await send(envelope('order.updated', { state: 'rejected', meta: { rejectedReason: 'insufficient funds' } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, type: 'order.updated' });
  });

  test('tolerates an order.updated body without meta', async () => {
    const res = await send(envelope('order.updated', { state: 'processed' }));
    expect(res.status).toBe(200);
  });

  test('acknowledges an event type it does not handle', async () => {
    const res = await send(envelope('some.future_event'));
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('some.future_event');
  });

  test('accepts a delivery signed the same way but sent with svix-* headers', async () => {
    const res = await send(envelope('order.created'), { prefix: 'svix' });
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('order.created');
  });

  test('prefers the webhook-* headers when both sets are present', async () => {
    const payload = envelope('order.created');
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
    const res = await send(envelope('order.created'), { contentType: 'text/plain' });
    expect(res.status).toBe(200);
  });

  test('verifies the exact raw bytes, including odd whitespace', async () => {
    const payload =
      '{ "type" : "order.created",\n "data":{"id":"o", "state":"placed"} }';
    const res = await send(payload);
    expect(res.status).toBe(200);
  });

  test('accepts any matching v1 entry and ignores other versions', async () => {
    const payload = envelope('subscription.created');
    const msgId = 'msg_multi';
    const timestamp = now();
    const good = sign(payload, msgId, timestamp);
    const bad = sign(payload, msgId, timestamp, OTHER_SECRET);
    const res = await send(payload, { msgId, timestamp, signature: `v1a,ignored ${bad} ${good}` });
    expect(res.status).toBe(200);
  });

  test('rejects a missing signature header', async () => {
    const res = await send(envelope('order.created'), {
      headers: { 'webhook-id': 'msg_1', 'webhook-timestamp': now() },
    });
    expect(res.status).toBe(400);
  });

  test('rejects a request with no webhook headers', async () => {
    const res = await send(envelope('order.created'), { headers: {} });
    expect(res.status).toBe(400);
  });

  test('rejects an invalid signature', async () => {
    const res = await send(envelope('order.created'), { signature: 'v1,aW52YWxpZA==' });
    expect(res.status).toBe(401);
  });

  test('rejects a signature made with another secret', async () => {
    const payload = envelope('order.created');
    const msgId = 'msg_other_secret';
    const timestamp = now();
    const res = await send(payload, { msgId, timestamp, signature: sign(payload, msgId, timestamp, OTHER_SECRET) });
    expect(res.status).toBe(401);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign(envelope('order.created'), msgId, timestamp);
    const res = await send(envelope('order.updated'), { msgId, timestamp, signature });
    expect(res.status).toBe(401);
  });

  test('rejects a stale timestamp (library window is 5 minutes)', async () => {
    const payload = envelope('order.created');
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
    delete process.env.MONERIUM_WEBHOOK_SECRET;
    const res = await send(envelope('order.created'));
    expect(res.status).toBe(500);
  });

  test('fails closed when the secret is not a whsec_ secret', async () => {
    process.env.MONERIUM_WEBHOOK_SECRET = 'not-a-whsec-secret';
    const res = await send(envelope('order.created'));
    expect(res.status).toBe(500);
  });
});
