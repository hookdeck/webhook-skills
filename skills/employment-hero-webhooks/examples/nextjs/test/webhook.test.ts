// Generated with: employment-hero-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/employment-hero/route';
import { verifyEmploymentHeroWebhook } from '../lib/verify-employment-hero';

// Synthetic secret key (base64 of 32 bytes), shaped like the one the Developer Portal shows.
const SECRET = 's3y0VT/1knFo5q9JnXJCjQHyPt8GfhmYkcS8lNF3D/Q=';
const KEY = Buffer.from(SECRET, 'base64');
const OTHER_KEY = crypto.createHash('sha256').update('another-employment-hero-webhook').digest();
const BAD_SECRET = 'not base64!';
const SIGNATURE_HEADER = 'x-employmenthero-signature';
const TIMESTAMP = '1731924900';

// Check vector: synthetic secret, fixed body and timestamp (Employment Hero publishes none).
const VECTOR_BODY = '{"id":"evt_1","type":"test","data":{"a":1}}';
const VECTOR_TIMESTAMP = '1700000000';
const VECTOR_SIGNATURE = 'y/dPUVP8svSzwTMHHftIu7AnRoLSZxFwdD8iK1MWLEY=';

// Made-up body: Employment Hero doesn't publish a payload sample. Pretty-printed so a
// re-serialised body would not match.
const BODY = JSON.stringify({ id: 'evt_test_1', type: 'test', data: { note: 'illustrative' } }, null, 2);
const TAMPER_FROM = 'illustrative';
const TAMPER_TO = 'tampered';

/** Sign like Employment Hero: base64 HMAC-SHA256 of "<timestamp>.<body>", keyed with the decoded secret. */
function sign(
  body: string | Buffer,
  { key = KEY, timestamp = TIMESTAMP }: { key?: Buffer; timestamp?: string } = {}
): Record<string, string> {
  const digest = crypto.createHmac('sha256', key).update(`${timestamp}.`).update(body).digest('base64');
  return { 'x-employmenthero-signature': digest, 'x-employmenthero-timestamp': timestamp };
}

const post = (body: string | Buffer, headers: Record<string, string> = {}, contentType = 'application/json') =>
  POST(
    new Request('http://localhost/webhooks/employment-hero', {
      method: 'POST',
      headers: { 'content-type': contentType, ...headers },
      body: typeof body === 'string' ? body : new Uint8Array(body),
    })
  );

const without = (headers: Record<string, string>, name: string) =>
  Object.fromEntries(Object.entries(headers).filter(([key]) => key !== name));

beforeEach(() => {
  process.env.EMPLOYMENT_HERO_WEBHOOK_SECRET = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifyEmploymentHeroWebhook', () => {
  it('matches the check vector', () => {
    expect(verifyEmploymentHeroWebhook(VECTOR_BODY, VECTOR_SIGNATURE, VECTOR_TIMESTAMP, SECRET)).toBe(true);
    expect(verifyEmploymentHeroWebhook(Buffer.from(VECTOR_BODY), VECTOR_SIGNATURE, VECTOR_TIMESTAMP, SECRET)).toBe(true);
  });

  it('rejects the vector with another timestamp or a malformed secret', () => {
    expect(verifyEmploymentHeroWebhook(VECTOR_BODY, VECTOR_SIGNATURE, '1700000001', SECRET)).toBe(false);
    expect(verifyEmploymentHeroWebhook(VECTOR_BODY, VECTOR_SIGNATURE, VECTOR_TIMESTAMP, BAD_SECRET)).toBe(false);
  });
});

describe('POST /webhooks/employment-hero', () => {
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
    process.env.EMPLOYMENT_HERO_WEBHOOK_SECRET = `${SECRET}\n`;
    expect((await post(BODY, sign(BODY))).status).toBe(200);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"truncated": ';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('returns 500 when the secret is missing or not valid base64', async () => {
    delete process.env.EMPLOYMENT_HERO_WEBHOOK_SECRET;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
    process.env.EMPLOYMENT_HERO_WEBHOOK_SECRET = BAD_SECRET;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });

  it('rejects a changed or missing timestamp', async () => {
    expect((await post(BODY, { ...sign(BODY), 'x-employmenthero-timestamp': '1731924901' })).status).toBe(401);
    expect((await post(BODY, without(sign(BODY), 'x-employmenthero-timestamp'))).status).toBe(401);
  });
});
