// Generated with: paylocity-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/paylocity/route';
import { verifyPaylocityWebhook } from '../lib/verify-paylocity';

// Synthetic secrets (base64 of 32 bytes), shaped like auth.hmac.key1.secret and key2.secret.
const SECRET = '6VYxrTi35LV17axsZ+L9bs/+RNu6M6T3bd6GYrToMf4=';
const NEXT_SECRET = 'iTkwcVdDt7tofILQTCR0G3Y3HulFNa8MqALLX9DRAYs=';
const KEY = Buffer.from(SECRET, 'base64');
const NEXT_KEY = Buffer.from(NEXT_SECRET, 'base64');
const KEY_ID = '1b2c3d4e-0000-4000-8000-000000000001';
const NEXT_KEY_ID = '7e4a0000-0000-4000-8000-000000000002';
const OTHER_KEY = crypto.createHash('sha256').update('another-paylocity-subscription').digest();
const BAD_SECRET = 'not base64!';
const SIGNATURE_HEADER = 'x-pcty-signature';
const TIMESTAMP = '1731924900';

// Check vector: both synthetic keys, fixed body and timestamp (Paylocity publishes none).
const VECTOR_BODY = '{"id":"evt_1","type":"test","data":{"a":1}}';
const VECTOR_TIMESTAMP = '1700000000';
const VECTOR_HEADER =
  'keyId=1b2c3d4e-0000-4000-8000-000000000001:signature=15276c12468d7d297cd6722ad59db1328f0d1c5e074c4faa5d4bde8a3877eeff,' +
  'keyId=7e4a0000-0000-4000-8000-000000000002:signature=f10b4cfed0480f20b0bef9557ffb8d1708ab2e22e59aa3aaf38ad06b63945f5d';

// Illustrative CloudEvents-style event, pretty-printed so a re-serialised body would not match.
const BODY = JSON.stringify(
  {
    id: '5b0e6a52-2f1d-4c8e-9a3b-7d4f1e2c6a90',
    type: 'employee.assignment.v1',
    time: '2026-11-18T10:15:00Z',
    data: { companyId: 'C1234', assignmentId: 'E5678' },
  },
  null,
  2
);
const TAMPER_FROM = 'E5678';
const TAMPER_TO = 'E5679';

const hexHmac = (key: Buffer, timestamp: string, body: string | Buffer) =>
  crypto.createHmac('sha256', key).update(`${timestamp}.`).update(body).digest('hex');

/** Sign like Paylocity with one active key. */
function sign(
  body: string | Buffer,
  { key = KEY, timestamp = TIMESTAMP }: { key?: Buffer; timestamp?: string } = {}
): Record<string, string> {
  return { 'x-pcty-signature': `keyId=${KEY_ID}:signature=${hexHmac(key, timestamp, body)}`, 'x-pcty-timestamp': timestamp };
}

/** Sign like Paylocity during rotation: one pair per active key. */
function signRotating(body: string, timestamp = TIMESTAMP): Record<string, string> {
  const pairs = [
    `keyId=${KEY_ID}:signature=${hexHmac(KEY, timestamp, body)}`,
    `keyId=${NEXT_KEY_ID}:signature=${hexHmac(NEXT_KEY, timestamp, body)}`,
  ];
  return { 'x-pcty-signature': pairs.join(','), 'x-pcty-timestamp': timestamp };
}

const post = (body: string | Buffer, headers: Record<string, string> = {}, contentType = 'application/json') =>
  POST(
    new Request('http://localhost/webhooks/paylocity', {
      method: 'POST',
      headers: { 'content-type': contentType, ...headers },
      body: typeof body === 'string' ? body : new Uint8Array(body),
    })
  );

const without = (headers: Record<string, string>, name: string) =>
  Object.fromEntries(Object.entries(headers).filter(([key]) => key !== name));

beforeEach(() => {
  process.env.PAYLOCITY_HMAC_SECRET = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.PAYLOCITY_TIMESTAMP_TOLERANCE_SECONDS;
  vi.restoreAllMocks();
});

describe('verifyPaylocityWebhook', () => {
  it('matches the check vector with either rotation key', () => {
    expect(verifyPaylocityWebhook(VECTOR_BODY, VECTOR_HEADER, VECTOR_TIMESTAMP, SECRET)).toBe(true);
    expect(verifyPaylocityWebhook(VECTOR_BODY, VECTOR_HEADER, VECTOR_TIMESTAMP, NEXT_SECRET)).toBe(true);
  });

  it('applies the age check only when a tolerance is given', () => {
    const at = (now: number) => ({ toleranceSeconds: 300, now });
    expect(verifyPaylocityWebhook(VECTOR_BODY, VECTOR_HEADER, VECTOR_TIMESTAMP, SECRET, at(1700000299))).toBe(true);
    expect(verifyPaylocityWebhook(VECTOR_BODY, VECTOR_HEADER, VECTOR_TIMESTAMP, SECRET, at(1700000301))).toBe(false);
    expect(verifyPaylocityWebhook(VECTOR_BODY, VECTOR_HEADER, VECTOR_TIMESTAMP, SECRET, { now: 1800000000 })).toBe(true);
  });
});

describe('POST /webhooks/paylocity', () => {
  it('accepts a valid signature', async () => {
    const res = await post(BODY, sign(BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, type: 'employee.assignment.v1' });
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
    process.env.PAYLOCITY_HMAC_SECRET = `${SECRET}\n`;
    expect((await post(BODY, sign(BODY))).status).toBe(200);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"truncated": ';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('returns 500 when the secret is missing or not valid base64', async () => {
    delete process.env.PAYLOCITY_HMAC_SECRET;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
    process.env.PAYLOCITY_HMAC_SECRET = BAD_SECRET;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });

  it('accepts a rotation header with either secret configured', async () => {
    expect((await post(BODY, signRotating(BODY))).status).toBe(200);
    process.env.PAYLOCITY_HMAC_SECRET = NEXT_SECRET;
    expect((await post(BODY, signRotating(BODY))).status).toBe(200);
  });

  it('checks the timestamp age only when PAYLOCITY_TIMESTAMP_TOLERANCE_SECONDS is set', async () => {
    expect((await post(BODY, sign(BODY))).status).toBe(200);
    process.env.PAYLOCITY_TIMESTAMP_TOLERANCE_SECONDS = '300';
    expect((await post(BODY, sign(BODY))).status).toBe(401);
    const fresh = String(Math.floor(Date.now() / 1000));
    expect((await post(BODY, sign(BODY, { timestamp: fresh }))).status).toBe(200);
  });
});
