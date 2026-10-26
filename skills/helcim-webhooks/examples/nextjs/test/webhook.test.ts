import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { POST } from '../app/webhooks/helcim/route';

// Helcim's verifierToken is bare base64 (no whsec_ prefix); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';
const OTHER_SECRET = 'b3RoZXJfc2VjcmV0X2tleQ==';

// Standard Webhooks algorithm: base64(HMAC-SHA256(base64-decoded token, `${id}.${timestamp}.${body}`))
function sign(payload: string, msgId: string, timestamp: string, secret = TEST_SECRET): string {
  const key = Buffer.from(secret, 'base64');
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
    new Request('http://localhost:3000/webhooks/helcim', {
      method: 'POST',
      headers: { 'content-type': opts.contentType ?? 'application/json', ...headers },
      body: payload,
    })
  );
}

const cardTransaction = () => JSON.stringify({ id: '25764674', type: 'cardTransaction' });
const terminalCancel = () =>
  JSON.stringify({
    data: {
      cancelledAt: '2026-01-14T18:38:18Z',
      currency: 'CAD',
      customerCode: '',
      deviceCode: 'NBL7',
      invoiceNumber: '',
      transactionAmount: 1,
    },
    type: 'terminalCancel',
  });

describe('Helcim webhook route', () => {
  beforeEach(() => {
    process.env.HELCIM_WEBHOOK_SECRET = TEST_SECRET;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('handles cardTransaction', async () => {
    const res = await send(cardTransaction());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, type: 'cardTransaction' });
  });

  test('handles terminalCancel', async () => {
    const res = await send(terminalCancel());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, type: 'terminalCancel' });
  });

  test('acknowledges an event type it does not handle', async () => {
    const res = await send(JSON.stringify({ type: 'somethingNew' }));
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('somethingNew');
  });

  test('accepts a delivery signed the same way but sent with svix-* headers', async () => {
    const res = await send(cardTransaction(), { prefix: 'svix' });
    expect(res.status).toBe(200);
    expect((await res.json()).type).toBe('cardTransaction');
  });

  test('prefers the webhook-* headers when both sets are present', async () => {
    const payload = cardTransaction();
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

  test('accepts the same token configured with a whsec_ prefix', async () => {
    process.env.HELCIM_WEBHOOK_SECRET = `whsec_${TEST_SECRET}`;
    const res = await send(cardTransaction());
    expect(res.status).toBe(200);
  });

  test('verifies the raw bytes whatever the content type', async () => {
    const res = await send(cardTransaction(), { contentType: 'text/plain' });
    expect(res.status).toBe(200);
  });

  test('verifies the exact raw bytes, including odd whitespace', async () => {
    const res = await send('{ "id" : "25764674",\n "type":"cardTransaction" }');
    expect(res.status).toBe(200);
  });

  test('accepts any matching v1 entry and ignores other versions', async () => {
    const payload = cardTransaction();
    const timestamp = now();
    const good = sign(payload, 'msg_multi', timestamp);
    const bad = sign(payload, 'msg_multi', timestamp, OTHER_SECRET);
    const res = await send(payload, { msgId: 'msg_multi', timestamp, signature: `v1a,ignored ${bad} ${good}` });
    expect(res.status).toBe(200);
  });

  test('rejects a missing signature header', async () => {
    const res = await send(cardTransaction(), { headers: { 'webhook-id': 'msg_1', 'webhook-timestamp': now() } });
    expect(res.status).toBe(400);
  });

  test('rejects a request with no webhook headers', async () => {
    const res = await send(cardTransaction(), { headers: {} });
    expect(res.status).toBe(400);
  });

  test('rejects an invalid signature', async () => {
    const res = await send(cardTransaction(), { signature: 'v1,aW52YWxpZA==' });
    expect(res.status).toBe(401);
  });

  test('rejects a signature made with another token', async () => {
    const payload = cardTransaction();
    const timestamp = now();
    const res = await send(payload, {
      msgId: 'msg_other_secret',
      timestamp,
      signature: sign(payload, 'msg_other_secret', timestamp, OTHER_SECRET),
    });
    expect(res.status).toBe(401);
  });

  test('rejects a tampered body', async () => {
    const timestamp = now();
    const signature = sign(cardTransaction(), 'msg_tamper', timestamp);
    const res = await send(terminalCancel(), { msgId: 'msg_tamper', timestamp, signature });
    expect(res.status).toBe(401);
  });

  test('rejects a stale timestamp (library window is 5 minutes)', async () => {
    const timestamp = (Math.floor(Date.now() / 1000) - 600).toString();
    const res = await send(cardTransaction(), { msgId: 'msg_stale', timestamp });
    expect(res.status).toBe(401);
  });

  test('returns 400 for a verified body that is not JSON', async () => {
    const res = await send('not json');
    expect(res.status).toBe(400);
  });

  test('fails closed when the secret is not configured', async () => {
    delete process.env.HELCIM_WEBHOOK_SECRET;
    const res = await send(cardTransaction());
    expect(res.status).toBe(500);
  });
});
