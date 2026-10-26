import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/agora/route';

// The Signing Secret is a free-form string used as UTF-8 bytes
const SECRET = 'agora_test_signing_secret';

// Same algorithm as Agora: lowercase hex HMAC-SHA1 of the raw body
function sign(payload: string, secret = SECRET): string {
  return crypto.createHmac('sha1', secret).update(payload).digest('hex');
}

function event(eventType: number): string {
  return JSON.stringify({
    noticeId: '2000001428:4330:107',
    productId: 1,
    eventType,
    notifyMs: 1611566412672,
    payload: { channelName: 'test_webhook', ts: 1611566412, uid: 1234, clientSeq: 1 },
  });
}

function post(body: string, signature?: string): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature !== undefined) headers['agora-signature'] = signature;
  return POST(new Request('http://localhost/webhooks/agora', { method: 'POST', headers, body }));
}

describe('Agora webhook route', () => {
  beforeEach(() => {
    process.env.AGORA_WEBHOOK_SECRET = SECRET;
  });

  it.each([101, 102, 103, 104, 105, 111])('accepts signed eventType %i', async (type) => {
    const body = event(type);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts an uppercase hex signature', async () => {
    const body = event(101);
    expect((await post(body, sign(body).toUpperCase())).status).toBe(200);
  });

  it('verifies exact bytes, not re-serialised JSON', async () => {
    const body = '{ "productId": 1,   "eventType": 101, "payload": {} }';
    expect((await post(body, sign(body))).status).toBe(200);
    expect((await post(body, sign(JSON.stringify(JSON.parse(body))))).status).toBe(401);
  });

  it('returns 401 for missing, malformed, and wrong signatures', async () => {
    const body = event(101);
    const good = sign(body);
    expect((await post(body)).status).toBe(401);
    expect((await post(body, '')).status).toBe(401);
    expect((await post(body, 'not-hex')).status).toBe(401);
    expect((await post(body, good.slice(0, 38))).status).toBe(401);
    expect((await post(body, 'sha1=' + good)).status).toBe(401);
    expect((await post(body, sign(body, 'wrong'))).status).toBe(401);
  });

  it('returns 401 when the secret is not configured', async () => {
    delete process.env.AGORA_WEBHOOK_SECRET;
    const body = event(101);
    expect((await post(body, sign(body))).status).toBe(401);
  });

  it('returns 400 for signed non-JSON', async () => {
    const body = 'not json';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('handles unknown event types and products', async () => {
    const body = JSON.stringify({ productId: 3, eventType: 999, payload: {} });
    expect((await post(body, sign(body))).status).toBe(200);
  });
});
