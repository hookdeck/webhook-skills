import crypto from 'crypto';
import { beforeEach, describe, expect, test } from 'vitest';
import { POST } from '../app/webhooks/emporix/route';

// Svix secrets are 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Same algorithm Svix uses: base64(HMAC-SHA256(decoded secret, `${id}.${timestamp}.${body}`))
function sign(payload: string, msgId: string, timestamp: string, secret = TEST_SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${signature}`;
}

const now = () => Math.floor(Date.now() / 1000).toString();

function send(
  payload: string,
  opts: { msgId?: string; timestamp?: string; signature?: string; headers?: Record<string, string>; query?: string; contentType?: string } = {}
) {
  const msgId = opts.msgId ?? `msg_${crypto.randomBytes(12).toString('hex')}`;
  const timestamp = opts.timestamp ?? now();
  const headers = opts.headers ?? {
    'svix-id': msgId,
    'svix-timestamp': timestamp,
    'svix-signature': opts.signature ?? sign(payload, msgId, timestamp),
  };
  return POST(
    new Request(`http://localhost:3000/webhooks/emporix${opts.query ?? ''}`, {
      method: 'POST',
      headers: { 'content-type': opts.contentType ?? 'application/json', ...headers },
      body: payload,
    })
  );
}

describe('Emporix webhook handler', () => {
  beforeEach(() => {
    process.env.EMPORIX_WEBHOOK_SECRET = TEST_SECRET;
  });

  test.each([
    ['order.created', { id: 'ord1', status: 'CREATED' }],
    ['order.updated', { id: 'ord1', status: 'CONFIRMED' }],
    ['customer.created', { customerNumber: 'CUS1', contactEmail: 'a@example.com' }],
    ['product.created', { id: 'p1', code: 'SKU-1' }],
    ['product.updated', { id: 'p1', code: 'SKU-1' }],
  ])('handles %s identified by the eventType query parameter', async (eventType, data) => {
    const res = await send(JSON.stringify(data), { query: `?eventType=${eventType}` });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, eventType });
  });

  test('prefers an eventType field in the body', async () => {
    const res = await send(JSON.stringify({ eventType: 'order.created', id: 'ord1' }));
    expect(res.status).toBe(200);
    expect((await res.json()).eventType).toBe('order.created');
  });

  test('accepts a valid body with no event type', async () => {
    const res = await send(JSON.stringify({ id: 'ord1' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, eventType: null });
  });

  test('handles unknown event types gracefully', async () => {
    const res = await send('{"id":"x"}', { query: '?eventType=something.new' });
    expect(res.status).toBe(200);
    expect((await res.json()).eventType).toBe('something.new');
  });

  test('verifies any content type via the raw body', async () => {
    const res = await send('{"id":"ord1"}', { contentType: 'application/cloudevents+json' });
    expect(res.status).toBe(200);
  });

  test('accepts any matching signature among several (secret rotation)', async () => {
    const payload = '{"id":"ord1"}';
    const msgId = 'msg_rotation';
    const timestamp = now();
    const signature = `v1,aW52YWxpZF9zaWduYXR1cmU= ${sign(payload, msgId, timestamp)}`;
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(200);
  });

  test('rejects missing headers', async () => {
    const res = await send('{}', { headers: {} });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Missing required webhook headers');
  });

  test('rejects an invalid signature', async () => {
    const res = await send('{"id":"ord1"}', { signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = '{"id":"ord1"}';
    const msgId = 'msg_other';
    const timestamp = now();
    const signature = sign(payload, msgId, timestamp, 'whsec_b3RoZXJfc2VjcmV0X2tleQ==');
    const res = await send(payload, { msgId, timestamp, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const msgId = 'msg_tamper';
    const timestamp = now();
    const signature = sign('{"id":"ord1"}', msgId, timestamp);
    const res = await send('{"id":"ord2"}', { msgId, timestamp, signature });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a timestamp older than 5 minutes', async () => {
    const res = await send('{"id":"ord1"}', { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Timestamp too old');
  });

  test('returns 500 when the secret is not configured', async () => {
    delete process.env.EMPORIX_WEBHOOK_SECRET;
    const res = await send('{"id":"ord1"}');
    expect(res.status).toBe(500);
  });
});
