// Generated with: spotdraft-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/spotdraft/route';
import { verifySpotDraftWebhook } from '../lib/verify-spotdraft';

// Synthetic hmac_key (base64 of 32 bytes), shaped like the one the API returns.
const SECRET = 'ZriLMkIFq6U9cm556D0HUEVn2hb3tZWHv5r/u7dgf2I=';
const KEY = Buffer.from(SECRET, 'base64');
const OTHER_KEY = crypto.createHash('sha256').update('another-spotdraft-workspace').digest();
const BAD_SECRET = 'not base64!';
const SIGNATURE_HEADER = 'x-sd-webhook-content-hash';

// Check vector: synthetic key and a fixed body (SpotDraft publishes none).
const VECTOR_BODY = '{"id":"evt_1","type":"test","data":{"a":1}}';
const VECTOR_HASH =
  '8a0bcf7b021c4420bc9892ba61e3bdd0790759d011db82857aacb7341a73e153' +
  '01f1e7b55e66c20868031a8102aed0392111e98173ff4c56ca5f4d595c33d347';

// Made-up body: SpotDraft's guides don't publish a payload sample. Pretty-printed so a
// re-serialised body would not match.
const BODY = JSON.stringify({ id: 'evt_test_1', activity: 'CONTRACT_EXECUTED', note: 'illustrative' }, null, 2);
const TAMPER_FROM = 'CONTRACT_EXECUTED';
const TAMPER_TO = 'CONTRACT_CREATED';

/** Sign like SpotDraft: hex HMAC-SHA512 of the raw body, keyed with the decoded hmac_key. */
function sign(
  body: string | Buffer,
  { key = KEY, algorithm = 'sha512' }: { key?: Buffer; algorithm?: string } = {}
): Record<string, string> {
  return { 'x-sd-webhook-content-hash': crypto.createHmac(algorithm, key).update(body).digest('hex') };
}

const post = (body: string | Buffer, headers: Record<string, string> = {}, contentType = 'application/json') =>
  POST(
    new Request('http://localhost/webhooks/spotdraft', {
      method: 'POST',
      headers: { 'content-type': contentType, ...headers },
      body: typeof body === 'string' ? body : new Uint8Array(body),
    })
  );

const without = (headers: Record<string, string>, name: string) =>
  Object.fromEntries(Object.entries(headers).filter(([key]) => key !== name));

beforeEach(() => {
  process.env.SPOTDRAFT_HMAC_KEY = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifySpotDraftWebhook', () => {
  it('matches the check vector', () => {
    expect(verifySpotDraftWebhook(VECTOR_BODY, VECTOR_HASH, SECRET)).toBe(true);
    expect(verifySpotDraftWebhook(Buffer.from(VECTOR_BODY), VECTOR_HASH.toUpperCase(), SECRET)).toBe(true);
  });

  it('rejects the vector with a malformed key or a truncated hash', () => {
    expect(verifySpotDraftWebhook(VECTOR_BODY, VECTOR_HASH, BAD_SECRET)).toBe(false);
    expect(verifySpotDraftWebhook(VECTOR_BODY, VECTOR_HASH.slice(0, 64), SECRET)).toBe(false);
  });
});

describe('POST /webhooks/spotdraft', () => {
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
    process.env.SPOTDRAFT_HMAC_KEY = `${SECRET}\n`;
    expect((await post(BODY, sign(BODY))).status).toBe(200);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"truncated": ';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('returns 500 when the secret is missing or not valid base64', async () => {
    delete process.env.SPOTDRAFT_HMAC_KEY;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
    process.env.SPOTDRAFT_HMAC_KEY = BAD_SECRET;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });

  it('rejects an HMAC-SHA256 hash in place of SHA-512', async () => {
    expect((await post(BODY, sign(BODY, { algorithm: 'sha256' }))).status).toBe(401);
  });
});
