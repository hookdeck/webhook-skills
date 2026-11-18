// Generated with: samsara-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/samsara/route';
import { verifySamsaraWebhook } from '../lib/verify-samsara';

// Samsara's documented sample secret key (base64, 20 bytes). Not a real credential.
const SECRET = 'rGoy+beNph0qGBLj6Aqoydj6SGA=';
const KEY = Buffer.from(SECRET, 'base64');
const OTHER_KEY = crypto.createHash('sha256').update('another-samsara-webhook').digest();
const BAD_SECRET = 'not base64!';
const SIGNATURE_HEADER = 'x-samsara-signature';
const TIMESTAMP = '1731924900';

// Check vector: Samsara's sample secret with a fixed body and timestamp.
// (The sample request on Samsara's page doesn't reproduce with the sample secret.)
const VECTOR_BODY = '{"id":"evt_1","type":"test","data":{"a":1}}';
const VECTOR_TIMESTAMP = '1587597109';
const VECTOR_SIGNATURE = 'v1=1a2489e57b7e943fbdf5068de365a580265f81dc81eee464b8e4f0491bafc0d3';

// Illustrative Ping (the Test button), pretty-printed so a re-serialised body would not match.
const BODY = JSON.stringify(
  { eventId: '8c4e2d1a-7b3f-4c9e-a2d5-0f6b8e1c3a97', eventMs: 1731924900123, eventType: 'Ping', event: { text: 'Ping' } },
  null,
  2
);
const TAMPER_FROM = '"eventMs": 1731924900123';
const TAMPER_TO = '"eventMs": 1731924900124';

/** Sign like Samsara: v1= + hex HMAC-SHA256 of "v1:<timestamp>:<body>", keyed with the decoded secret. */
function sign(
  body: string | Buffer,
  { key = KEY, timestamp = TIMESTAMP }: { key?: Buffer; timestamp?: string } = {}
): Record<string, string> {
  const digest = crypto.createHmac('sha256', key).update(`v1:${timestamp}:`).update(body).digest('hex');
  return { 'x-samsara-signature': `v1=${digest}`, 'x-samsara-timestamp': timestamp };
}

const post = (body: string | Buffer, headers: Record<string, string> = {}, contentType = 'application/json') =>
  POST(
    new Request('http://localhost/webhooks/samsara', {
      method: 'POST',
      headers: { 'content-type': contentType, ...headers },
      body: typeof body === 'string' ? body : new Uint8Array(body),
    })
  );

const without = (headers: Record<string, string>, name: string) =>
  Object.fromEntries(Object.entries(headers).filter(([key]) => key !== name));

beforeEach(() => {
  process.env.SAMSARA_WEBHOOK_SECRET = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifySamsaraWebhook', () => {
  it('matches the check vector built from the sample secret', () => {
    expect(verifySamsaraWebhook(VECTOR_BODY, VECTOR_SIGNATURE, VECTOR_TIMESTAMP, SECRET)).toBe(true);
    expect(verifySamsaraWebhook(Buffer.from(VECTOR_BODY), VECTOR_SIGNATURE, VECTOR_TIMESTAMP, SECRET)).toBe(true);
  });

  it('rejects the vector with another timestamp or a malformed secret', () => {
    expect(verifySamsaraWebhook(VECTOR_BODY, VECTOR_SIGNATURE, '1587597110', SECRET)).toBe(false);
    expect(verifySamsaraWebhook(VECTOR_BODY, VECTOR_SIGNATURE, VECTOR_TIMESTAMP, BAD_SECRET)).toBe(false);
  });
});

describe('POST /webhooks/samsara', () => {
  it('accepts a valid signature', async () => {
    const res = await post(BODY, sign(BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, eventType: 'Ping' });
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
    process.env.SAMSARA_WEBHOOK_SECRET = `${SECRET}\n`;
    expect((await post(BODY, sign(BODY))).status).toBe(200);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"truncated": ';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('returns 500 when the secret is missing or not valid base64', async () => {
    delete process.env.SAMSARA_WEBHOOK_SECRET;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
    process.env.SAMSARA_WEBHOOK_SECRET = BAD_SECRET;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });

  it('rejects a signature without the v1= prefix or with another version', async () => {
    const digest = sign(BODY)[SIGNATURE_HEADER].slice('v1='.length);
    expect((await post(BODY, { ...sign(BODY), [SIGNATURE_HEADER]: digest })).status).toBe(401);
    expect((await post(BODY, { ...sign(BODY), [SIGNATURE_HEADER]: `v2=${digest}` })).status).toBe(401);
  });

  it('rejects a changed or missing timestamp', async () => {
    expect((await post(BODY, { ...sign(BODY), 'x-samsara-timestamp': '1731924901' })).status).toBe(401);
    expect((await post(BODY, without(sign(BODY), 'x-samsara-timestamp'))).status).toBe(401);
  });
});
