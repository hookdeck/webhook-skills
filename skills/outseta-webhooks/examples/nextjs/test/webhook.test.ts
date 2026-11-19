// Generated with: outseta-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/outseta/route';
import { verifyOutsetaWebhook } from '../lib/verify-outseta';

// Synthetic Webhook Signature Key: 32 bytes as hex, like the output of openssl rand -hex 32.
const SECRET = '587f17dc2d218994867047c65133e38fc10c94f664fdc3c78370c49c0bf1a480';
const KEY = Buffer.from(SECRET, 'hex');
const OTHER_KEY = crypto.createHash('sha256').update('another-outseta-account').digest();
// The same 32 bytes written as base64: Outseta requires hex, so the handler refuses it.
const BAD_SECRET = 'WH8X3C0hiZSGcEfGUTPjj8EMlPZk/cPHg3DEnAvxpIA=';
const SIGNATURE_HEADER = 'x-hub-signature-256';

// Check vector: synthetic key and a fixed body (Outseta publishes none).
const VECTOR_BODY = '{"id":"evt_1","type":"test","data":{"a":1}}';
const VECTOR_SIGNATURE = 'sha256=1ed97849266847e37b36371bba32e3d8013a5cd0a9abcd59c52441be43da18ba';

// Made-up Person record: Outseta's signature article doesn't show a payload. Pretty-printed
// so a re-serialised body would not match.
const BODY = JSON.stringify({ Uid: 'wZmNw7Q2', Email: 'ada@example.com', FirstName: 'Ada', LastName: 'Lovelace' }, null, 2);
const TAMPER_FROM = 'ada@example.com';
const TAMPER_TO = 'eve@example.com';

/** Sign like Outseta: sha256= + hex HMAC-SHA256 of the raw body, keyed with the hex-decoded key. */
function sign(body: string | Buffer, { key = KEY }: { key?: Buffer } = {}): Record<string, string> {
  return { 'x-hub-signature-256': `sha256=${crypto.createHmac('sha256', key).update(body).digest('hex')}` };
}

const post = (body: string | Buffer, headers: Record<string, string> = {}, contentType = 'application/json') =>
  POST(
    new Request('http://localhost/webhooks/outseta', {
      method: 'POST',
      headers: { 'content-type': contentType, ...headers },
      body: typeof body === 'string' ? body : new Uint8Array(body),
    })
  );

const without = (headers: Record<string, string>, name: string) =>
  Object.fromEntries(Object.entries(headers).filter(([key]) => key !== name));

beforeEach(() => {
  process.env.OUTSETA_WEBHOOK_SIGNATURE_KEY = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifyOutsetaWebhook', () => {
  it('matches the check vector', () => {
    expect(verifyOutsetaWebhook(VECTOR_BODY, VECTOR_SIGNATURE, SECRET)).toBe(true);
    expect(verifyOutsetaWebhook(Buffer.from(VECTOR_BODY), VECTOR_SIGNATURE, SECRET)).toBe(true);
  });

  it('rejects the vector with a key that is not hex', () => {
    expect(verifyOutsetaWebhook(VECTOR_BODY, VECTOR_SIGNATURE, BAD_SECRET)).toBe(false);
  });
});

describe('POST /webhooks/outseta', () => {
  it('accepts a valid signature', async () => {
    const res = await post(BODY, sign(BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('rejects a signature keyed with the secret as UTF-8 text instead of its decoded bytes', async () => {
    expect((await post(BODY, sign(BODY, { key: Buffer.from(SECRET, 'utf8') }))).status).toBe(401);
  });

  it('rejects another secret, a tampered body and a missing signature header', async () => {
    expect((await post(BODY, sign(BODY, { key: OTHER_KEY }))).status).toBe(401);
    expect((await post(BODY.replace(TAMPER_FROM, TAMPER_TO), sign(BODY))).status).toBe(401);
    expect((await post(BODY, without(sign(BODY), SIGNATURE_HEADER))).status).toBe(401);
  });

  it('accepts a secret with a trailing newline', async () => {
    process.env.OUTSETA_WEBHOOK_SIGNATURE_KEY = `${SECRET}\n`;
    expect((await post(BODY, sign(BODY))).status).toBe(200);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"truncated": ';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('returns 500 when the secret is missing or not valid hex', async () => {
    delete process.env.OUTSETA_WEBHOOK_SIGNATURE_KEY;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
    process.env.OUTSETA_WEBHOOK_SIGNATURE_KEY = BAD_SECRET;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });

  it('rejects the hex key decoded as base64 and a missing sha256= prefix', async () => {
    expect((await post(BODY, sign(BODY, { key: Buffer.from(SECRET, 'base64') }))).status).toBe(401);
    const bare = sign(BODY)[SIGNATURE_HEADER].slice('sha256='.length);
    expect((await post(BODY, { [SIGNATURE_HEADER]: bare })).status).toBe(401);
  });
});
