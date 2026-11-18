// Generated with: brex-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST, verifyBrexWebhook } from '../app/webhooks/brex/route';

// Brex's guide shows the secret as bare base64; the HMAC key is its decoded bytes.
const SECRET = Buffer.from('brex-test-signing-key-0123456789').toString('base64');

function sign(rawBody: string, id: string, timestamp: string, secret = SECRET): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`, 'utf8').digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);
let counter = 0;
const newMessageId = () => `msg_test${++counter}${Date.now().toString(36)}`;

interface SignOptions {
  id?: string;
  timestamp?: number | string;
  secret?: string;
  signature?: string;
}

function signedHeaders(rawBody: string, opts: SignOptions = {}): Record<string, string> {
  const id = opts.id ?? newMessageId();
  const ts = String(opts.timestamp ?? now());
  return {
    'content-type': 'application/json',
    'webhook-id': id,
    'webhook-timestamp': ts,
    'webhook-signature': opts.signature ?? sign(rawBody, id, ts, opts.secret),
  };
}

const post = (rawBody: string, headers: Record<string, string>) =>
  POST(new Request('http://localhost/webhooks/brex', { method: 'POST', headers, body: rawBody }));

const transfer = (event_type = 'TRANSFER_PROCESSED') =>
  JSON.stringify({
    event_type,
    transfer_id: 'dptx_ckyypz30n000101kgzgnrtqlf',
    payment_type: 'ACH',
    company_id: 'cuacc_ckqckhadg000601r95ox48c2s',
  });

beforeEach(() => {
  process.env.BREX_WEBHOOK_SECRET = SECRET;
  delete process.env.BREX_WEBHOOK_TOLERANCE_SECONDS;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("Brex's documented example", () => {
  // From https://developer.brex.com/guides/webhooks (verification section).
  const docSecret = '4j7OxQ4wlv1GmkZ9qLjoFjEFXjpzvHkr';
  const docBody =
    '{"event_type": "TRANSFER_PROCESSED", "transfer_id": "dptx_ckyypz30n000101kgzgnrtqlf", "company_id": "cuacc_ckqckhadg000601r95ox48c2s"}';
  const docHeaders = {
    'webhook-id': 'msg_24Ky2257Hzd0tgc5bWs8TwK9Kod',
    'webhook-timestamp': '1643393361',
    'webhook-signature': 'v1,6mFFi/Bg0gw1Yz2KJwZSVq6Bh+XzllS7JVltAlZ8yCU= v1,9dEEi/Bg0gw1Yz2KJwZSVq6Bh+XzllS7JVltAlZ8yDY=',
  };

  it('verifies with the bare secret and with a whsec_ prefix', () => {
    expect(verifyBrexWebhook(docBody, docHeaders, docSecret)).toBe(true);
    expect(verifyBrexWebhook(Buffer.from(docBody), docHeaders, `whsec_${docSecret}`)).toBe(true);
  });

  it('fails with a 60-second tolerance because the example is from 2022', () => {
    expect(verifyBrexWebhook(docBody, docHeaders, docSecret, 60)).toBe(false);
  });

  it('accepts the documented delivery end to end', async () => {
    process.env.BREX_WEBHOOK_SECRET = docSecret;
    const res = await post(docBody, { 'content-type': 'application/json', ...docHeaders });
    expect(res.status).toBe(200);
  });
});

describe('valid signatures', () => {
  it.each(['TRANSFER_PROCESSED', 'TRANSFER_FAILED'])('accepts %s', async (type) => {
    const body = transfer(type);
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts USER_UPDATED', async () => {
    const body = JSON.stringify({ event_type: 'USER_UPDATED', user_id: 'cuuser_1', company_id: 'cuacc_1', updated_attributes: ['STATUS'] });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('updated: STATUS'));
  });

  it('accepts a whsec_-prefixed secret', async () => {
    process.env.BREX_WEBHOOK_SECRET = `whsec_${SECRET}`;
    const body = transfer();
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('acknowledges unknown event types with 200', async () => {
    const body = JSON.stringify({ event_type: 'SOME_FUTURE_EVENT' });
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(200);
  });

  it('accepts when any of two signatures matches (key rotation)', async () => {
    const oldSecret = Buffer.from('old-brex-signing-key-0123456789x').toString('base64');
    const body = transfer();
    const id = newMessageId();
    const ts = String(now());
    const headers = signedHeaders(body, { id, timestamp: ts });
    headers['webhook-signature'] = `${sign(body, id, ts, oldSecret)} ${headers['webhook-signature']}`;
    const res = await post(body, headers);
    expect(res.status).toBe(200);
  });

  it('returns 200 duplicate for a resent message (same Webhook-Id)', async () => {
    const body = transfer();
    const id = newMessageId();
    const first = await post(body, signedHeaders(body, { id }));
    const resend = await post(body, signedHeaders(body, { id, timestamp: now() + 1 }));
    expect(first.status).toBe(200);
    expect(await resend.json()).toEqual({ received: true, duplicate: true });
  });
});

describe('invalid requests', () => {
  it('rejects missing signature headers with 400', async () => {
    const res = await post(transfer(), { 'content-type': 'application/json' });
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with a different secret', async () => {
    const other = Buffer.from('some-other-secret-key-0123456789').toString('base64');
    const body = transfer();
    const res = await post(body, signedHeaders(body, { secret: other }));
    expect(res.status).toBe(400);
  });

  it('rejects a signature keyed with the secret string instead of its decoded bytes', async () => {
    const body = transfer();
    const id = newMessageId();
    const ts = String(now());
    const wrong = crypto.createHmac('sha256', SECRET).update(`${id}.${ts}.${body}`).digest('base64');
    const res = await post(body, signedHeaders(body, { id, timestamp: ts, signature: `v1,${wrong}` }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const body = transfer();
    const headers = signedHeaders(body);
    const res = await post(body.replace('ACH', 'DOMESTIC_WIRE'), headers);
    expect(res.status).toBe(400);
  });

  it('rejects a stale timestamp when BREX_WEBHOOK_TOLERANCE_SECONDS is set', async () => {
    process.env.BREX_WEBHOOK_TOLERANCE_SECONDS = '60';
    const body = transfer();
    const res = await post(body, signedHeaders(body, { timestamp: now() - 600 }));
    expect(res.status).toBe(400);
  });
});

describe('fail closed', () => {
  it('returns 500 when BREX_WEBHOOK_SECRET is not set', async () => {
    delete process.env.BREX_WEBHOOK_SECRET;
    const body = transfer();
    const res = await post(body, signedHeaders(body));
    expect(res.status).toBe(500);
  });
});
